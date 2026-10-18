<#
.SYNOPSIS
    Duely Hosting Script — share your local Duely instance with friends.

.DESCRIPTION
    This script starts/stops Duely in LAN or Internet hosting mode using Docker Compose.
    It detects the LAN IP of the adapter that holds your default route and, in LAN mode,
    opens the Windows Firewall for port 3000 on private networks.
    In Internet mode it creates a Cloudflare Quick Tunnel for public access instead
    (no firewall change is needed, because the tunnel connects outwards).

.EXAMPLE
    .\host.ps1 start                  # Start LAN hosting
    .\host.ps1 start -Internet        # Start Internet hosting (Cloudflare Tunnel)
    .\host.ps1 stop                   # Stop all containers and tunnels
    .\host.ps1 status                 # Show current status and URLs

.NOTES
    Requirements:
    - Docker Desktop must be running
    - For Google sign-in to work remotely, add the tunnel's host name to Firebase
      Authorized Domains. Guests can always play without signing in.
#>

param(
    [Parameter(Position = 0)]
    [ValidateSet("start", "stop", "status")]
    [string]$Action = "start",

    [switch]$Internet
)

# ─── Helpers ──────────────────────────────────────────────────────────────────

function Get-LanIP {
    # The IPv4 address of the interface that holds the default route, i.e. the adapter that
    # actually reaches your router. Virtual adapters (WSL, Hyper-V) don't usually own it.
    $route = Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue |
        ForEach-Object {
            $iface = Get-NetIPInterface -InterfaceIndex $_.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue
            [pscustomobject]@{ Index = $_.ifIndex; Metric = $_.RouteMetric + $iface.InterfaceMetric }
        } |
        Sort-Object Metric | Select-Object -First 1
    if ($route) {
        $ip = Get-NetIPAddress -InterfaceIndex $route.Index -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object { $_.IPAddress -notlike "169.254.*" } |
            Select-Object -First 1 -ExpandProperty IPAddress
        if ($ip) { return $ip }
    }

    # Fallback: any IPv4 address on an adapter that isn't virtual or loopback
    return Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object {
            $_.IPAddress -ne "127.0.0.1" -and $_.IPAddress -notlike "169.254.*" -and
            $_.InterfaceAlias -notmatch "^(vEthernet|WSL|Hyper-V|VirtualBox|VMware|Loopback)"
        } |
        Select-Object -First 1 -ExpandProperty IPAddress
}

function Invoke-Compose {
    # Every call uses both files and the internet profile, so stop/status also see the tunnel.
    Push-Location $ProjectRoot
    try {
        docker compose -f docker-compose.yml -f docker-compose.local.yml --profile internet @args
    }
    finally {
        Pop-Location
    }
}

function Get-TunnelUrl {
    # The newest quick-tunnel URL in the tunnel's logs. Older lines remain after restarts, and
    # error lines can mention api.trycloudflare.com, which is not a tunnel.
    $lines = Invoke-Compose logs --no-color tunnel 2>&1 | ForEach-Object { "$_" }
    $urls = foreach ($line in $lines) {
        foreach ($m in [regex]::Matches($line, "https://[a-zA-Z0-9-]+\.trycloudflare\.com")) {
            if ($m.Value -ne "https://api.trycloudflare.com") { $m.Value }
        }
    }
    return $urls | Select-Object -Last 1
}

function Test-IsAdmin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Add-FirewallRule {
    $ruleName = "Duely LAN Hosting (TCP 3000)"
    $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    if (-not $existing) {
        if (Test-IsAdmin) {
            $params = @{ DisplayName = $ruleName; Direction = "Inbound"; Protocol = "TCP"; LocalPort = 3000; Action = "Allow"; Profile = "Private" }
            New-NetFirewallRule @params | Out-Null
            Write-Host "  [Firewall] Opened port 3000 for private networks" -ForegroundColor Green
        }
        else {
            Write-Host ""
            Write-Host "  [Firewall] Port 3000 may be blocked. To fix, run ONE of:" -ForegroundColor Yellow
            Write-Host "    Option A: Re-run this script as Administrator" -ForegroundColor Gray
            Write-Host "    Option B: Manually run:" -ForegroundColor Gray
            Write-Host "      New-NetFirewallRule -DisplayName 'Duely LAN Hosting (TCP 3000)' -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private" -ForegroundColor DarkGray
            Write-Host ""
        }
    }
    else {
        Write-Host "  [Firewall] Port 3000 already open" -ForegroundColor DarkGreen
    }
}

function Remove-FirewallRule {
    $ruleName = "Duely LAN Hosting (TCP 3000)"
    $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    if ($existing) {
        if (Test-IsAdmin) {
            Remove-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
            Write-Host "  [Firewall] Removed port 3000 rule" -ForegroundColor Green
        }
        else {
            Write-Host "  [Firewall] Could not remove firewall rule (not running as admin)" -ForegroundColor Yellow
            Write-Host "    To clean up manually: Remove-NetFirewallRule -DisplayName 'Duely LAN Hosting (TCP 3000)'" -ForegroundColor Gray
        }
    }
}

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

# ─── Actions ──────────────────────────────────────────────────────────────────

switch ($Action) {

    "start" {
        Write-Host ""
        if ($Internet) {
            Write-Host "  =======================================" -ForegroundColor Cyan
            Write-Host "       Duely - Internet Hosting Mode     " -ForegroundColor Cyan
            Write-Host "  =======================================" -ForegroundColor Cyan
        } else {
            Write-Host "  =======================================" -ForegroundColor Cyan
            Write-Host "       Duely - LAN Hosting Mode          " -ForegroundColor Cyan
            Write-Host "  =======================================" -ForegroundColor Cyan
        }
        Write-Host ""

        # 1. Detect LAN IP
        $lanIP = Get-LanIP
        if (-not $lanIP) {
            Write-Host "  [ERROR] Could not detect your LAN IP address." -ForegroundColor Red
            Write-Host "  Make sure you are connected to Wi-Fi or Ethernet." -ForegroundColor Red
            exit 1
        }
        Write-Host "  [Network] Your LAN IP: $lanIP" -ForegroundColor Green

        # 2. Check Docker
        $dockerRunning = docker info 2>&1 | Select-String "Server Version"
        if (-not $dockerRunning) {
            Write-Host "  [ERROR] Docker is not running. Please start Docker Desktop first." -ForegroundColor Red
            exit 1
        }
        Write-Host "  [Docker]  Docker is running" -ForegroundColor Green

        # 3. LAN mode needs port 3000 open to the local network; the tunnel doesn't.
        if (-not $Internet) {
            Add-FirewallRule
        }

        # 4. Set environment and start containers
        $env:LAN_IP = $lanIP

        Write-Host ""
        Write-Host "  Building and starting containers..." -ForegroundColor Yellow
        Write-Host "  (This may take a few minutes on the first run)" -ForegroundColor DarkGray
        Write-Host ""

        # --wait returns once the backend is healthy and the frontend is running
        Push-Location $ProjectRoot
        if ($Internet) {
            docker compose -f docker-compose.yml -f docker-compose.local.yml --profile internet up --build -d --wait
        } else {
            docker compose -f docker-compose.yml -f docker-compose.local.yml up --build -d --wait
        }
        $exitCode = $LASTEXITCODE
        Pop-Location

        if ($exitCode -ne 0) {
            Write-Host ""
            Write-Host "  [ERROR] Docker Compose failed. Check the output above for details." -ForegroundColor Red
            exit 1
        }

        # 5. Handle Internet Tunnel if requested
        $tunnelUrl = ""
        if ($Internet) {
            Write-Host ""
            Write-Host "  [Tunnel]  Waiting for public URL..." -ForegroundColor Yellow
            
            # Wait for the URL to appear in the logs (max 30 seconds)
            for ($i = 0; $i -lt 30 -and -not $tunnelUrl; $i++) {
                Start-Sleep -Seconds 1
                $tunnelUrl = Get-TunnelUrl
            }

            if (-not $tunnelUrl) {
                Write-Host "  [ERROR] Failed to get Cloudflare Tunnel URL. Check logs: docker compose logs tunnel" -ForegroundColor Red
                exit 1
            }
            Write-Host "  [Tunnel]  Tunnel connected successfully!" -ForegroundColor Green
        }

        $lanUrl = "http://" + $lanIP + ":3000"
        Write-Host ""
        Write-Host "  ================================================" -ForegroundColor Green
        Write-Host ""  -ForegroundColor Green
        Write-Host "    Duely is live!" -ForegroundColor Green
        Write-Host ""  -ForegroundColor Green

        if ($Internet) {
            Write-Host "    Share this PUBLIC URL with your friends:" -ForegroundColor Green
            Write-Host "    --> $tunnelUrl" -ForegroundColor White
            Write-Host ""  -ForegroundColor Green
        } else {
            Write-Host "    Share this LOCAL URL with your friends (same Wi-Fi only):" -ForegroundColor Green
            Write-Host "    --> $lanUrl" -ForegroundColor White
            Write-Host ""  -ForegroundColor Green
        }

        Write-Host "    You can access it locally via:" -ForegroundColor Green
        Write-Host "    --> http://localhost:3000" -ForegroundColor DarkGray
        Write-Host ""  -ForegroundColor Green
        Write-Host "  ================================================" -ForegroundColor Green
        Write-Host ""
        
        if ($Internet) {
            Write-Host "  [FIREBASE TIP] For Google sign-in to work for your friends, add this domain" -ForegroundColor DarkYellow
            Write-Host "  to Firebase Authorized Domains (it changes every time the tunnel starts):" -ForegroundColor DarkYellow
            Write-Host "  --> $(([Uri]$tunnelUrl).Host)" -ForegroundColor White
            Write-Host "  (Firebase Console > Authentication > Settings > Authorized domains)" -ForegroundColor Gray
        } else {
            Write-Host "  [FIREBASE TIP] Google sign-in usually won't work on a raw LAN IP (Firebase" -ForegroundColor DarkYellow
            Write-Host "  authorized domains are host names). Friends on the LAN can play as guests," -ForegroundColor DarkYellow
            Write-Host "  or use .\host.ps1 start -Internet for an https URL that supports sign-in." -ForegroundColor DarkYellow
        }
        Write-Host ""
        Write-Host "  To stop:  .\host.ps1 stop" -ForegroundColor Gray
        Write-Host ""

        # 6. Open in browser (always use localhost — tunnel/LAN URLs are for friends)
        Start-Process "http://localhost:3000"
    }

    "stop" {
        Write-Host ""
        Write-Host "  Stopping Duely hosting..." -ForegroundColor Yellow

        Invoke-Compose down

        Remove-FirewallRule

        Write-Host ""
        Write-Host "  Duely stopped." -ForegroundColor Green
        Write-Host "  To start normal dev mode: docker compose up" -ForegroundColor Gray
        Write-Host ""
    }

    "status" {
        $lanIP = Get-LanIP
        Write-Host ""
        Write-Host "  =======================================" -ForegroundColor Cyan
        Write-Host "       Duely - Status                    " -ForegroundColor Cyan
        Write-Host "  =======================================" -ForegroundColor Cyan
        Write-Host ""

        if ($lanIP) {
            Write-Host "  [Network] Your LAN IP: $lanIP" -ForegroundColor Green
        }
        else {
            Write-Host "  [Network] Could not detect LAN IP" -ForegroundColor Red
        }

        # Running containers (ps always prints a header, so test the id list instead)
        $running = Invoke-Compose ps --status running -q 2>$null
        if ($running) {
            Write-Host ""
            Write-Host "  Running containers:" -ForegroundColor White
            Invoke-Compose ps 2>$null | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
            Write-Host ""

            $tunnelUrl = Get-TunnelUrl
            if ($tunnelUrl) {
                Write-Host "  URL for friends (Internet): $tunnelUrl" -ForegroundColor Green
            } elseif ($lanIP) {
                Write-Host "  URL for friends (LAN): http://$($lanIP):3000" -ForegroundColor Green
            }
        }
        else {
            Write-Host "  [Status] No containers running" -ForegroundColor Yellow
            Write-Host "  Run .\host.ps1 start [-Internet] to begin hosting" -ForegroundColor Gray
        }

        # Check firewall rule
        $rule = Get-NetFirewallRule -DisplayName "Duely LAN Hosting (TCP 3000)" -ErrorAction SilentlyContinue
        if ($rule) {
            Write-Host "  [Firewall] Port 3000 rule: ACTIVE" -ForegroundColor Green
        }
        else {
            Write-Host "  [Firewall] Port 3000 rule: NOT SET" -ForegroundColor Yellow
        }
        Write-Host ""
    }
}
