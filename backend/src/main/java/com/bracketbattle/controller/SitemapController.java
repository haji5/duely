package com.bracketbattle.controller;

import com.bracketbattle.repository.BracketListRepository;
import com.bracketbattle.seo.PageHeads;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.util.HtmlUtils;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * /sitemap.xml (proxied as-is by nginx): home, browse, about, every public bracket, and the
 * results page of each bracket with a counted run, all read from the counters on the bracket
 * rows. A sitemap file may hold at most 50,000 URLs, and each bracket gives up to two, so past
 * that /sitemap.xml becomes a sitemap index of /sitemap-1.xml, /sitemap-2.xml, ... with
 * {@link #bracketsPerFile} brackets each, in id order (a file's brackets only change when one
 * goes). URLs use app.public-base-url, never the Host header. Not cached in Valkey: crawlers ask
 * rarely, and nginx lets them cache it for an hour.
 */
@RestController
public class SitemapController {

    private static final MediaType XML = new MediaType(MediaType.APPLICATION_XML, StandardCharsets.UTF_8);
    private static final String[] STATIC_PAGES = {"/", "/browse", "/about"};

    private final BracketListRepository brackets;
    private final PageHeads pageHeads;
    private final int bracketsPerFile;

    public SitemapController(BracketListRepository brackets, PageHeads pageHeads,
                             @Value("${app.sitemap.max-urls-per-file:50000}") int maxUrlsPerFile) {
        this.brackets = brackets;
        this.pageHeads = pageHeads;
        // The static pages go in the first file, alongside its brackets.
        this.bracketsPerFile = (maxUrlsPerFile - STATIC_PAGES.length) / 2;
    }

    @GetMapping("/sitemap.xml")
    public ResponseEntity<String> sitemap() {
        int files = fileCount();
        if (files <= 1) {
            return xml(urlset(1));
        }
        StringBuilder xml = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
                + "<sitemapindex xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n");
        for (int n = 1; n <= files; n++) {
            xml.append("  <sitemap><loc>").append(HtmlUtils.htmlEscape(pageHeads.origin() + "/sitemap-" + n + ".xml"))
                    .append("</loc></sitemap>\n");
        }
        xml.append("</sitemapindex>\n");
        return xml(xml.toString());
    }

    /** One part of the index. Part 1 always exists; it is the whole sitemap while there is no index. */
    @GetMapping("/sitemap-{part}.xml")
    public ResponseEntity<String> sitemapPart(@PathVariable String part) {
        int n;
        try {
            n = Integer.parseInt(part);
        } catch (NumberFormatException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }
        if (n < 1 || n > Math.max(1, fileCount())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }
        return xml(urlset(n));
    }

    private int fileCount() {
        return (int) Math.ceilDiv(brackets.countListed(), (long) bracketsPerFile);
    }

    private String urlset(int part) {
        StringBuilder xml = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
                + "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n");
        if (part == 1) {
            Instant newestBracket = brackets.newestListed();
            url(xml, "/", newestBracket);
            url(xml, "/browse", newestBracket);
            url(xml, "/about", null);
        }
        List<BracketListRepository.SitemapEntry> entries = brackets.sitemapEntries((long) (part - 1) * bracketsPerFile, bracketsPerFile);
        entries.forEach(b -> url(xml, "/bracket/" + b.id(), b.createdAt()));
        entries.stream().filter(b -> b.lastRunAt() != null)
                .forEach(b -> url(xml, "/results/" + b.id(), b.lastRunAt()));
        xml.append("</urlset>\n");
        return xml.toString();
    }

    private void url(StringBuilder xml, String path, Instant lastmod) {
        xml.append("  <url><loc>").append(HtmlUtils.htmlEscape(pageHeads.origin() + path)).append("</loc>");
        if (lastmod != null) {
            xml.append("<lastmod>").append(lastmod.truncatedTo(ChronoUnit.SECONDS)).append("</lastmod>");
        }
        xml.append("</url>\n");
    }

    private static ResponseEntity<String> xml(String body) {
        return ResponseEntity.ok().contentType(XML).body(body);
    }
}
