package com.bracketbattle.controller;

import com.bracketbattle.model.Bracket;
import com.bracketbattle.repository.ResultRepository;
import com.bracketbattle.seo.PageHeads;
import com.bracketbattle.service.BracketService;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.util.HtmlUtils;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * /sitemap.xml (proxied as-is by nginx): home, browse, every playable bracket and the results
 * page of each bracket that has runs. URLs use app.public-base-url, never the Host header. Not
 * cached in Valkey: the bracket list is already cached and the per-bracket MAX is one indexed
 * GROUP BY; nginx lets clients cache it for an hour.
 */
@RestController
public class SitemapController {

    private static final MediaType XML = new MediaType(MediaType.APPLICATION_XML, StandardCharsets.UTF_8);

    private final BracketService bracketService;
    private final ResultRepository resultRepository;
    private final PageHeads pageHeads;

    public SitemapController(BracketService bracketService, ResultRepository resultRepository, PageHeads pageHeads) {
        this.bracketService = bracketService;
        this.resultRepository = resultRepository;
        this.pageHeads = pageHeads;
    }

    @GetMapping("/sitemap.xml")
    public ResponseEntity<String> sitemap() {
        List<Bracket> brackets = bracketService.getAllBrackets();
        Map<Long, Instant> latestRun = resultRepository.findLatestResultPerBracket().stream()
                .filter(r -> r.getLatest() != null)
                .collect(Collectors.toMap(ResultRepository.LatestResult::getBracketId, ResultRepository.LatestResult::getLatest));
        Instant newestBracket = brackets.stream().map(Bracket::getCreatedAt).filter(Objects::nonNull)
                .max(Comparator.naturalOrder()).orElse(null);

        StringBuilder xml = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
                + "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n");
        url(xml, "/", newestBracket);
        url(xml, "/browse", newestBracket);
        url(xml, "/about", null);
        brackets.forEach(b -> url(xml, "/bracket/" + b.getId(), b.getCreatedAt()));
        brackets.stream().filter(b -> latestRun.containsKey(b.getId()))
                .forEach(b -> url(xml, "/results/" + b.getId(), latestRun.get(b.getId())));
        xml.append("</urlset>\n");
        return ResponseEntity.ok().contentType(XML).body(xml.toString());
    }

    private void url(StringBuilder xml, String path, Instant lastmod) {
        xml.append("  <url><loc>").append(HtmlUtils.htmlEscape(pageHeads.origin() + path)).append("</loc>");
        if (lastmod != null) {
            xml.append("<lastmod>").append(lastmod.truncatedTo(ChronoUnit.SECONDS)).append("</lastmod>");
        }
        xml.append("</url>\n");
    }
}
