package com.bracketbattle.seo;

import com.bracketbattle.dto.ItemRankingDto;
import com.bracketbattle.media.MediaUrls;
import com.bracketbattle.dto.BracketDto;
import com.bracketbattle.dto.ItemDto;
import org.jsoup.nodes.DataNode;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Fills the SPA shell with per-route head tags (title, description, canonical, Open Graph,
 * JSON-LD) and a short plain-text summary inside {@code #root}, for crawlers and link unfurlers
 * that don't run JavaScript. React's createRoot replaces the summary on load.
 *
 * <p>User text is stored as typed, markup included (see Sanitizer), so it only ever goes in
 * through jsoup's text and attribute setters, which escape it, or through {@link JsonLd}. Never as
 * HTML. Titles and descriptions mirror frontend/src/components/PageMeta.tsx and the pages that use it.
 *
 * <p>Every page also carries the origin as {@code <meta name="public-origin">}, so the app's own
 * canonicals and share links use it too instead of whatever host the page was loaded from.
 */
@Component
public class PageHeads {

    static final int MAX_TITLE = 60;
    static final int MAX_DESCRIPTION = 155;
    static final String SUFFIX = " | Duely";
    static final String HOME_TITLE = "Duely — Song, video & image brackets, voted head to head";
    static final String HOME_DESCRIPTION = "Make a bracket of songs, videos or images and pick a favourite of two each "
            + "match, round after round, until one is left. Play brackets others made.";
    /** Entries listed in a bracket's summary; the JSON-LD lists all of them. */
    static final int SUMMARY_ENTRIES = 100;
    static final int SUMMARY_RANKINGS = 10;

    /** The meta tag that hands the origin to the SPA (read by publicOrigin in PageMeta.tsx). */
    static final String ORIGIN_META = "public-origin";

    private final String origin;

    /**
     * With {@code app.require-public-origin} (set in production) the backend refuses to start
     * unless the origin is https on a host other people can reach: canonicals, the sitemap and
     * shared links would otherwise point every visitor at their own machine.
     */
    public PageHeads(@Value("${app.public-base-url}") String publicBaseUrl,
                     @Value("${app.require-public-origin:false}") boolean requirePublicOrigin) {
        URI uri = URI.create(publicBaseUrl.trim());
        if (uri.getHost() == null || !("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()))) {
            throw new IllegalArgumentException("app.public-base-url must be an absolute http(s) URL: " + publicBaseUrl);
        }
        if (requirePublicOrigin) {
            String reason = notPublicBecause(uri);
            if (reason != null) {
                throw new IllegalStateException("app.public-base-url (PUBLIC_BASE_URL) must be the public https origin, "
                        + "but " + publicBaseUrl + " " + reason);
            }
        }
        this.origin = publicBaseUrl.trim().replaceAll("/+$", "");
    }

    /** Why {@code uri} can't be the public origin, or null if it can. Never resolves a host name. */
    static String notPublicBecause(URI uri) {
        if (!"https".equals(uri.getScheme())) {
            return "is not https";
        }
        String host = uri.getHost().toLowerCase(Locale.ROOT).replaceAll("\\.$", "");
        if (host.startsWith("[") && host.endsWith("]")) {
            host = host.substring(1, host.length() - 1);
        }
        if (host.equals("localhost") || host.endsWith(".localhost")) {
            return "is localhost";
        }
        // URI only reports a host for a valid IPv4 literal, so getByName never looks anything up.
        if (host.contains(":") || host.matches("\\d{1,3}(\\.\\d{1,3}){3}")) {
            InetAddress address;
            try {
                address = InetAddress.getByName(host);
            } catch (UnknownHostException e) {
                return "is not a valid address";
            }
            byte[] bytes = address.getAddress();
            boolean uniqueLocal = bytes.length == 16 && (bytes[0] & 0xfe) == 0xfc;
            if (address.isLoopbackAddress() || address.isAnyLocalAddress()) {
                return "is a loopback or unspecified address";
            }
            if (address.isSiteLocalAddress() || address.isLinkLocalAddress() || uniqueLocal) {
                return "is a private address";
            }
        }
        return null;
    }

    /** The public origin without a trailing slash, e.g. https://duely.example. */
    public String origin() {
        return origin;
    }

    // ---- pages -----------------------------------------------------------------------------

    public Document home(Document shell) {
        common(shell, HOME_TITLE, HOME_DESCRIPTION, "/");
        defaultImage(shell);
        jsonLd(shell, List.of(
                node("WebSite", "/#website",
                        "url", url("/"),
                        "name", "Duely",
                        "description", "Tournament-style voting for your favorite songs, videos, and images",
                        "inLanguage", "en",
                        "publisher", ref("/#organization"),
                        "potentialAction", map(
                                "@type", "SearchAction",
                                "target", map("@type", "EntryPoint", "urlTemplate", url("/browse?q={search_term_string}")),
                                "query-input", "required name=search_term_string")),
                node("WebApplication", "/#app",
                        "name", "Duely",
                        "url", url("/"),
                        "description", "Line up songs, videos or images in a bracket and pick one of two each round "
                                + "until a single favourite is left standing.",
                        "applicationCategory", "EntertainmentApplication",
                        "operatingSystem", "Any (web browser)",
                        "browserRequirements", "Requires JavaScript",
                        "image", url("/logo512.png")),
                node("Organization", "/#organization",
                        "name", "Duely",
                        "url", url("/"),
                        "logo", map("@type", "ImageObject", "url", url("/logo512.png"), "width", 512, "height", 512),
                        "sameAs", List.of("https://github.com/haji5/duely"))));
        return shell;
    }

    public Document bracket(Document shell, BracketDto bracket, List<ItemDto> items) {
        String path = "/bracket/" + bracket.getId();
        String name = bracket.getName();
        String category = blankTo(bracket.getCategory(), "General");
        String summary = items.size() + "-entry " + kind(bracket) + " bracket";
        String description = "Play " + name + ", a " + summary + " in " + category + ". "
                + blankTo(bracket.getDescription(), "Pick a favourite of two each match until one is left standing.");

        common(shell, pageTitle(name, " — " + summary, ""), description, path);
        meta(shell, "property", "og:title", name);
        image(shell, items.isEmpty() ? null : items.get(0));

        List<Object> listElements = new ArrayList<>();
        for (int i = 0; i < items.size(); i++) {
            listElements.add(map("@type", "ListItem", "position", i + 1, "item", creativeWork(items.get(i))));
        }
        Map<String, Object> webPage = node("WebPage", path + "#webpage",
                "url", url(path),
                "name", name,
                "description", blankToNull(bracket.getDescription()),
                "datePublished", bracket.getCreatedAt() == null ? null : bracket.getCreatedAt().toString(),
                "keywords", category,
                "inLanguage", "en",
                "isPartOf", ref("/#website"),
                "about", ref(path + "#list"),
                "breadcrumb", ref(path + "#breadcrumb"));
        jsonLd(shell, List.of(
                webPage,
                node("ItemList", path + "#list",
                        "name", name,
                        "itemListOrder", "https://schema.org/Unordered",
                        "numberOfItems", items.size(),
                        "itemListElement", listElements),
                breadcrumbs(path, crumb("Home", url("/")), crumb("Browse", url("/browse")), crumb(name, null))));

        Element main = root(shell);
        main.appendElement("h1").text(name);
        if (blankToNull(bracket.getDescription()) != null) {
            main.appendElement("p").text(bracket.getDescription());
        }
        main.appendElement("p").text("A " + summary + " in " + category
                + ". Pick a favourite of two each match until one is left standing.");
        if (!items.isEmpty()) {
            main.appendElement("h2").text("Entries");
            Element list = main.appendElement("ol");
            items.stream().limit(SUMMARY_ENTRIES).forEach(item -> list.appendElement("li").text(item.getTitle()));
            if (items.size() > SUMMARY_ENTRIES) {
                main.appendElement("p").text("…and " + (items.size() - SUMMARY_ENTRIES) + " more.");
            }
        }
        main.appendElement("p").appendElement("a").attr("href", "/results/" + bracket.getId()).text("See everyone’s ranking");
        return shell;
    }

    public Document results(Document shell, BracketDto bracket, List<ItemDto> items, List<ItemRankingDto> rankings) {
        String path = "/results/" + bracket.getId();
        String name = bracket.getName();
        String leader = rankings.isEmpty() ? null : rankings.get(0).getItem().getTitle();
        String description = "Everyone’s ranking for " + name + ", a " + items.size() + "-entry " + kind(bracket)
                + " bracket on Duely." + (leader != null ? " In the lead: " + leader + "." : " Play it and add your own run.");

        common(shell, pageTitle(name, " results: everyone’s ranking", " results"), description, path);
        meta(shell, "property", "og:title", name + " results: everyone’s ranking");
        image(shell, !rankings.isEmpty() ? rankings.get(0).getItem() : items.isEmpty() ? null : items.get(0));

        List<Object> listElements = new ArrayList<>();
        for (int i = 0; i < rankings.size(); i++) {
            ItemRankingDto row = rankings.get(i);
            listElements.add(map("@type", "ListItem",
                    "position", i + 1,
                    "name", row.getItem().getTitle(),
                    "description", wonText(row),
                    "item", creativeWork(row.getItem())));
        }
        jsonLd(shell, List.of(
                node("WebPage", path + "#webpage",
                        "url", url(path),
                        "name", "Results: " + name,
                        "inLanguage", "en",
                        "isPartOf", ref("/#website"),
                        "mainEntity", ref(path + "#ranking"),
                        "breadcrumb", ref(path + "#breadcrumb")),
                node("ItemList", path + "#ranking",
                        "name", "Everyone’s ranking: " + name,
                        "itemListOrder", "https://schema.org/ItemListOrderDescending",
                        "numberOfItems", rankings.size(),
                        "itemListElement", listElements),
                breadcrumbs(path, crumb("Home", url("/")), crumb(name, url("/bracket/" + bracket.getId())),
                        crumb("Results", null))));

        Element main = root(shell);
        main.appendElement("h1").text(name + ": everyone’s ranking");
        main.appendElement("p").text(description);
        if (rankings.isEmpty()) {
            main.appendElement("p").text("No runs yet.");
        } else {
            Element list = main.appendElement("ol");
            rankings.stream().limit(SUMMARY_RANKINGS)
                    .forEach(row -> list.appendElement("li").text(row.getItem().getTitle() + ": " + wonText(row)));
        }
        main.appendElement("p").appendElement("a").attr("href", "/bracket/" + bracket.getId()).text("Play this bracket");
        return shell;
    }

    /** The shell, marked noindex, for a 404 (React then renders its not-found page). */
    public Document notFound(Document shell) {
        meta(shell, "name", "robots", "noindex");
        meta(shell, "name", ORIGIN_META, origin);
        return shell;
    }

    // ---- text helpers (keep in sync with PageMeta.tsx) ---------------------------------------

    static String truncate(String text, int max) {
        if (text.length() <= max) return text;
        int end = max - 1;
        if (Character.isHighSurrogate(text.charAt(end - 1))) end--;
        return text.substring(0, end).stripTrailing() + "…";
    }

    static String pageTitle(String main, String detail, String shortDetail) {
        String full = main + detail + SUFFIX;
        if (full.length() <= MAX_TITLE) return full;
        return truncate(main, MAX_TITLE - SUFFIX.length() - shortDetail.length()) + shortDetail + SUFFIX;
    }

    /** "song" for video brackets in Music (music videos), else the bracket type. Same rule as bracketKind in PageMeta.tsx. */
    static String kind(BracketDto bracket) {
        return "video".equals(bracket.getType()) && "Music".equals(bracket.getCategory()) ? "song" : bracket.getType();
    }

    /** Same wording as the results page: "95% of 62 matches won". */
    static String wonText(ItemRankingDto row) {
        return row.getWinPercentage() + "% of " + row.getTotalMatches() + " "
                + (row.getTotalMatches() == 1 ? "match" : "matches") + " won";
    }

    // ---- head helpers ----------------------------------------------------------------------

    private void common(Document shell, String title, String description, String path) {
        String shortDescription = truncate(description, MAX_DESCRIPTION);
        shell.title(title);
        meta(shell, "name", "description", shortDescription);
        link(shell, "canonical", url(path));
        meta(shell, "property", "og:type", "website");
        meta(shell, "property", "og:url", url(path));
        meta(shell, "property", "og:title", title);
        meta(shell, "property", "og:description", shortDescription);
        meta(shell, "name", "twitter:card", "summary_large_image");
        meta(shell, "name", ORIGIN_META, origin);
    }

    /** The entry's YouTube thumbnail (always 480x360 at hqdefault), else the site image. */
    private void image(Document shell, ItemDto item) {
        String videoId = item == null ? null : MediaUrls.youTubeVideoId(item.getMediaUrl());
        if (videoId == null) {
            defaultImage(shell);
            return;
        }
        meta(shell, "property", "og:image", "https://i.ytimg.com/vi/" + videoId + "/hqdefault.jpg");
        meta(shell, "property", "og:image:width", "480");
        meta(shell, "property", "og:image:height", "360");
        meta(shell, "property", "og:image:alt", item.getTitle());
    }

    private void defaultImage(Document shell) {
        meta(shell, "property", "og:image", url("/og.png"));
    }

    /** Sets a meta tag's content, adding the tag to the head if the shell doesn't have it. */
    private static void meta(Document shell, String keyAttribute, String key, String content) {
        Element tag = shell.head().getElementsByTag("meta").stream()
                .filter(e -> key.equals(e.attr(keyAttribute)))
                .findFirst()
                .orElseGet(() -> shell.head().appendElement("meta").attr(keyAttribute, key));
        tag.attr("content", content);
    }

    private static void link(Document shell, String rel, String href) {
        Element tag = shell.head().getElementsByTag("link").stream()
                .filter(e -> rel.equals(e.attr("rel")))
                .findFirst()
                .orElseGet(() -> shell.head().appendElement("link").attr("rel", rel));
        tag.attr("href", href);
    }

    private static void jsonLd(Document shell, List<Map<String, Object>> graph) {
        shell.head().appendElement("script").attr("type", "application/ld+json")
                .appendChild(new DataNode(JsonLd.toScriptContent(map("@context", "https://schema.org", "@graph", graph))));
    }

    private static Element root(Document shell) {
        return shell.getElementById("root").empty().appendElement("main");
    }

    // ---- JSON-LD helpers -------------------------------------------------------------------

    private String url(String path) {
        return origin + path;
    }

    private Map<String, Object> ref(String path) {
        return map("@id", url(path));
    }

    private Map<String, Object> node(String type, String idPath, Object... keyValues) {
        Map<String, Object> node = map("@type", type, "@id", url(idPath));
        node.putAll(map(keyValues));
        return node;
    }

    @SafeVarargs
    private Map<String, Object> breadcrumbs(String path, Map<String, Object>... crumbs) {
        List<Object> elements = new ArrayList<>();
        for (int i = 0; i < crumbs.length; i++) {
            Map<String, Object> element = map("@type", "ListItem", "position", i + 1);
            element.putAll(crumbs[i]);
            elements.add(element);
        }
        return node("BreadcrumbList", path + "#breadcrumb", "itemListElement", elements);
    }

    private static Map<String, Object> crumb(String name, String item) {
        return map("name", name, "item", item);
    }

    private static Map<String, Object> creativeWork(ItemDto item) {
        return map("@type", "CreativeWork", "name", item.getTitle(), "url", item.getMediaUrl());
    }

    /** An ordered map from alternating keys and values; null values are left out. */
    private static Map<String, Object> map(Object... keyValues) {
        Map<String, Object> map = new LinkedHashMap<>();
        for (int i = 0; i < keyValues.length; i += 2) {
            if (keyValues[i + 1] != null) {
                map.put((String) keyValues[i], keyValues[i + 1]);
            }
        }
        return map;
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s;
    }

    private static String blankTo(String s, String fallback) {
        return s == null || s.isBlank() ? fallback : s;
    }
}
