package com.fintwin.service;

import org.springframework.stereotype.Service;

import java.util.Map;

@Service
public class CategoryService {

private static final Map<String, String> RULES = Map.ofEntries(

        Map.entry("swiggy", "Food"),
        Map.entry("zomato", "Food"),
        Map.entry("dominos", "Food"),
        Map.entry("mcdonald", "Food"),
        Map.entry("kfc", "Food"),

        Map.entry("uber", "Travel"),
        Map.entry("ola", "Travel"),
        Map.entry("rapido", "Travel"),

        Map.entry("amazon", "Shopping"),
        Map.entry("flipkart", "Shopping"),
        Map.entry("myntra", "Shopping"),
        Map.entry("ajio", "Shopping"),
        Map.entry("shopping", "Shopping"),

        Map.entry("electricity", "Bills"),
        Map.entry("bill", "Bills"),
        Map.entry("recharge", "Bills"),
        Map.entry("airtel", "Bills"),
        Map.entry("jio", "Bills"),

        Map.entry("salary", "Income"),
        Map.entry("bonus", "Income"),
        Map.entry("freelance", "Income")
);

public String categorize(String merchant) {

    if (merchant == null) {
        return "Other";
    }

    String value =
            merchant.toLowerCase().trim();

    for (Map.Entry<String, String> rule :
            RULES.entrySet()) {

        if (value.contains(rule.getKey())) {

            return rule.getValue();
        }
    }

    return "Other";
}

}