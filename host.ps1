<#
.SYNOPSIS
    Duely LAN Hosting Script — share your local Duely instance with friends on the same network.

.DESCRIPTION
    This script starts/stops Duely in LAN hosting mode using Docker Compose.
    It auto-detects your local IP address, configures CORS and nginx accordingly,
    and optionally opens the Windows Firewall for port 3000.

.EXAMPLE
    .\host.ps1 start        # Start LAN hosting
    .\host.ps1 stop         # Stop all containers
    .\host.ps1 status       # Show current status and URL

.NOTES
    Requirements:
    - Docker Desktop must be running
    - Friends must be on the same Wi-Fi / LAN network
    - For Google sign-in, add your LAN IP to Firebase Authorized Domains
#>

param(
    [Parameter(Position = 0)]
    [ValidateSet("start", "stop", "status")]
    [string]$Action = "start"
)

# ─── Helpers ──────────────────────────────────────────────────────────────────

function Get-LanIP {
    # Returns the first IPv4 address on a Wi-Fi or Ethernet adapter
    $ip = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch "Loopback" -and $_.IPAddress -ne "127.0.0.1" -and $_.PrefixOrigin -ne "WellKnown" -and ($_.InterfaceAlias -match "Wi-Fi|Ethernet|WLAN|LAN|eth") } | Sort-Object -Property InterfaceMetric | Select-Object -First 1 -ExpandProperty IPAddress

    if (-not $ip) {
        # Fallback: grab any non-loopback IPv4 address
        $ip = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -ne "127.0.0.1" -and $_.PrefixOrigin -ne "WellKnown" } | Select-Object -First 1 -ExpandProperty IPAddress
    }

    return $ip
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
        Write-Host "  =======================================" -ForegroundColor Cyan
        Write-Host "       Duely - LAN Hosting Mode          " -ForegroundColor Cyan
        Write-Host "  =======================================" -ForegroundColor Cyan
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

        # 3. Open firewall
        Add-FirewallRule

        # 4. Set environment and start containers
        $env:LAN_IP = $lanIP
        Write-Host ""
        Write-Host "  Building and starting containers..." -ForegroundColor Yellow
        Write-Host "  (This may take a few minutes on the first run)" -ForegroundColor DarkGray
        Write-Host ""

        Push-Location $ProjectRoot
        docker-compose -f docker-compose.yml -f docker-compose.local.yml up --build -d
        $exitCode = $LASTEXITCODE
        Pop-Location

        if ($exitCode -ne 0) {
            Write-Host ""
            Write-Host "  [ERROR] Docker Compose failed. Check the output above for details." -ForegroundColor Red
            exit 1
        }

        $shareUrl = "http://" + $lanIP + ":3000"
        Write-Host ""
        Write-Host "  ================================================" -ForegroundColor Green
        Write-Host ""  -ForegroundColor Green
        Write-Host "    Duely is live!" -ForegroundColor Green
        Write-Host ""  -ForegroundColor Green
        Write-Host "    Share this URL with your friends:" -ForegroundColor Green
        Write-Host "    --> $shareUrl" -ForegroundColor White
        Write-Host ""  -ForegroundColor Green
        Write-Host "    You can also use:" -ForegroundColor Green
        Write-Host "    --> http://localhost:3000" -ForegroundColor DarkGray
        Write-Host ""  -ForegroundColor Green
        Write-Host "  ================================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "  [TIP] For Google sign-in to work for friends, add $lanIP" -ForegroundColor DarkYellow
        Write-Host "        to Firebase Console > Authentication > Settings > Authorized domains" -ForegroundColor DarkYellow
        Write-Host ""
        Write-Host "  To stop:  .\host.ps1 stop" -ForegroundColor Gray
        Write-Host ""

        # 5. Open in browser
        Start-Process $shareUrl
    }

    "stop" {
        Write-Host ""
        Write-Host "  Stopping Duely LAN hosting..." -ForegroundColor Yellow

        Push-Location $ProjectRoot
        docker-compose -f docker-compose.yml -f docker-compose.local.yml down
        Pop-Location

        Remove-FirewallRule

        Write-Host ""
        Write-Host "  Duely stopped." -ForegroundColor Green
        Write-Host "  To start normal dev mode: docker-compose up" -ForegroundColor Gray
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

        # Check if containers are running
        Push-Location $ProjectRoot
        $containers = docker-compose -f docker-compose.yml -f docker-compose.local.yml ps 2>$null
        Pop-Location

        if ($containers) {
            Write-Host ""
            Write-Host "  Running containers:" -ForegroundColor White
            $containers | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
            Write-Host ""
            if ($lanIP) {
                $shareUrl = "http://" + $lanIP + ":3000"
                Write-Host "  URL for friends: $shareUrl" -ForegroundColor Green
            }
        }
        else {
            Write-Host "  [Status] No containers running" -ForegroundColor Yellow
            Write-Host "  Run .\host.ps1 start to begin hosting" -ForegroundColor Gray
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
