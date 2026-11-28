package com.fintwin.controller;

import com.fintwin.service.TwinService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/twin")
public class TwinController {

    private final TwinService twins;

    public TwinController(TwinService twins) {
        this.twins = twins;
    }

    @GetMapping
    public TwinService.Twin twin() {
        return twins.twin();
    }
}
