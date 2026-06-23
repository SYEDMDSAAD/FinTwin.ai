package com.fintwin.controller;

import com.fintwin.dto.ForecastDTO;
import com.fintwin.dto.MonthlyExpenseDTO;
import com.fintwin.dto.CategoryForecastDTO;
import java.util.List;

import com.fintwin.service
    .ForecastService;

import org.springframework.web.bind.annotation.*;

@RestController

@RequestMapping("/api/forecast")


public class ForecastController {

    private final ForecastService
        forecastService;

    public ForecastController(

        ForecastService
            forecastService

    ) {

        this.forecastService =
            forecastService;
    }

    @GetMapping

    public ForecastDTO
    getForecast() {

        return forecastService
            .generateForecast();
    }
    @GetMapping("/monthly-history")
    public List<MonthlyExpenseDTO>
    getMonthlyHistory() {

        return forecastService
                .getMonthlyHistory();
    }
    @GetMapping("/category")
    public List<CategoryForecastDTO>
    getCategoryForecast() {

        return forecastService
                .getCategoryForecast();
    }
}