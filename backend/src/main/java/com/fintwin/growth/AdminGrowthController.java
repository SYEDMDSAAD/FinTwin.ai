package com.fintwin.growth;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * The admin page's Growth tab: landing visitors, demo usage and the funnel.
 * Aggregates only (no visitor is identifiable), plus the questions asked in
 * the demo, which are about its sample data.
 */
@RestController
@RequestMapping("/api/v1/admin/growth")
@PreAuthorize("hasAuthority('READ_AGGREGATE_ANALYTICS')")
public class AdminGrowthController {

    private final GrowthService growth;

    public AdminGrowthController(GrowthService growth) {
        this.growth = growth;
    }

    @GetMapping
    public Map<String, Object> summary(@RequestParam(defaultValue = "30") int days) {
        return growth.summary(Math.max(1, Math.min(days, 365)));
    }
}
