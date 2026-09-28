package com.fintwin.security;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;

class MetricsTokenFilterTest {

    private MockHttpServletResponse run(MetricsTokenFilter filter, String path, String authorization) throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest("GET", path);
        if (authorization != null) req.addHeader("Authorization", authorization);
        MockHttpServletResponse res = new MockHttpServletResponse();
        filter.doFilter(req, res, new MockFilterChain());
        return res;
    }

    @Test
    void closedWhenNoTokenIsConfigured() throws Exception {
        assertThat(run(new MetricsTokenFilter(""), "/actuator/prometheus", "Bearer anything").getStatus()).isEqualTo(404);
    }

    @Test
    void needsTheExactBearerToken() throws Exception {
        MetricsTokenFilter f = new MetricsTokenFilter("s3cret");
        assertThat(run(f, "/actuator/prometheus", null).getStatus()).isEqualTo(401);
        assertThat(run(f, "/actuator/prometheus", "Bearer wrong").getStatus()).isEqualTo(401);
        assertThat(run(f, "/actuator/prometheus", "s3cret").getStatus()).isEqualTo(401);
        assertThat(run(f, "/actuator/prometheus", "Bearer s3cret").getStatus()).isEqualTo(200);
    }

    @Test
    void leavesEveryOtherPathAlone() throws Exception {
        assertThat(run(new MetricsTokenFilter(""), "/actuator/health", null).getStatus()).isEqualTo(200);
        assertThat(run(new MetricsTokenFilter("s3cret"), "/api/v1/goals", null).getStatus()).isEqualTo(200);
    }
}
