# Where each rule lives

Numbers match the rules in `SKILL.md`. Python tests are in `guard-service/tests/`, the frontend tests in
`frontend/src/pages/SpendGuardPage.test.jsx`, and the backend tests in
`backend/src/test/java/com/fintwin/controller/`. If you move or rename one of these, update this file.

| # | Rule | Enforced in | Guarded by |
|---|---|---|---|
| 1–2 | Never moves money; only two kinds of UPI link | `rules.py`: `handoff_link`, `self_transfer_link` | `test_rules.py`: `test_a_qr_code_with_an_amount_is_handed_on_unchanged`, `test_only_the_amount_and_currency_are_ever_added`, `test_a_top_up_link_pays_only_the_users_own_account`; `test_api.py`: `test_the_top_up_link_pays_the_users_own_account` |
| 2 | The payee only comes from the QR code | `rules.py`: `parse_upi` | `test_rules.py`: `test_reads_a_merchant_qr_code`, `test_refuses_anything_but_a_upi_payment`, `test_refuses_a_qr_code_with_two_payees`, `test_refuses_other_currencies_and_huge_amounts` |
| 3 | The buffer is a hard limit; bill money never moves | `rules.py`: `check_topup`, `clamp_to_buffer`, `fallback_topup` | `test_rules.py`: `test_a_top_up_never_goes_past_the_buffer`, `test_approve_less_has_to_be_less`, `test_essentials_and_bills_are_locked`; `test_api.py`: `test_bill_money_never_moves` |
| 4 | Emergency top-up limits | `rules.py`: `emergency_refusal` | `test_rules.py`: `test_emergency_top_ups_have_fixed_limits`; `test_api.py`: `test_emergency_top_ups_skip_the_questions_within_limits` |
| 5 | A plan adds up to the salary | `rules.py`: `check_plan`, `fallback_plan` | `test_rules.py`: `test_a_plan_that_adds_up_is_accepted`, `test_a_plan_that_breaks_a_rule_is_rejected`, `test_the_fallback_plan_adds_up_and_covers_essentials`, `test_a_salary_below_the_bills_is_refused` |
| 6 | A person's details never reach the model | `rules.py`: `scan_facts` (the `untrusted` dict) | `test_rules.py`: `test_a_persons_name_and_upi_id_never_reach_the_model` |
| 6 | Untrusted text stays inside its JSON block | `agents/brain.py`: `prompt` | `test_evals.py`: `test_injected_text_only_ever_sits_inside_the_untrusted_block` |
| 7 | The user's own UPI ID is masked | `rules.py`: `mask_upi`; `main.py`: the wallet view | `test_api.py`: `test_settings_are_checked` |
| 8 | Real data goes only to Vertex AI; no data, no model | `agents/brain.py`: `availability`; `flows.py`: `decide` (`no_data`) | `test_brain.py`: `test_real_user_data_only_goes_to_vertex` |
| 9 | Answers are grounded, kind and link-free | `rules.py`: `clean_message`, `check_scan`, `check_topup`, `check_cuts`, `check_plan` | `test_rules.py`: `test_messages_may_only_quote_figures_from_the_facts`, `test_messages_never_shame_and_never_carry_links`, `test_a_pause_with_an_invented_figure_is_rejected`, `test_bad_cuts_are_rejected`, `test_a_stray_rupee_prefix_is_fixed_and_still_checked` |
| 10 | The AI never holds up a payment; the rules take over | `flows.py`: `consult`, `decide`; `main.py`: `REQUEST_BUDGET`, `AGENT_BUDGET` | `test_api.py`: `test_a_slow_agent_never_holds_up_a_payment`, `test_a_broken_answer_falls_back_to_the_rules`, `test_without_the_ai_the_rules_decide`, `test_the_payday_planner_gets_three_tries_then_the_rules_plan`; `test_brain.py`: `test_a_rejected_answer_goes_back_to_the_same_session` |
| 11 | Essentials and small payments skip the AI | `rules.py`: `fast_lane` | `test_rules.py`: `test_essentials_and_small_payments_skip_the_ai_but_betting_never_does`; `test_api.py`: `test_groceries_go_straight_through_without_asking_the_ai` |
| 12 | Betting always pauses, whatever the amount | `rules.py`: `ALWAYS_CHECK_MCC`, `fast_lane`, `check_scan`, `fallback_scan`; `agents/prompts.py`: `SCAN`; `guardMock.js`: `check` | `test_rules.py`: `test_essentials_and_small_payments_skip_the_ai_but_betting_never_does`, `test_betting_is_always_paused_by_the_fallback`, `test_a_bet_always_pauses_even_when_the_agent_says_go`; `test_api.py`: `test_a_small_bet_still_pauses_when_the_agent_says_go`; `SpendGuardPage.test.jsx`: "always pauses a bet in mock mode, however small"; eval case `betting_small` |
| 13 | At most 3 pauses a day | `rules.py`: `fast_lane` (`max_pauses_per_day`) | `test_rules.py`: `test_after_three_pauses_in_a_day_spend_guard_stops_pausing` |
| 14 | A 5-second pause, and the user can always pay | `ScanPanel.jsx`: `PAUSE_SECONDS` | `SpendGuardPage.test.jsx`: "holds Pay anyway for five seconds…", "always lets the user move the money anyway when told to wait" |
| 15 | Sample shops never open a UPI app | `ScanPanel.jsx`; `format.js`: `isSample` | `SpendGuardPage.test.jsx`: "never opens a UPI app for a made-up sample shop" |
| 16 | USER role only, the allowlist, and the server sets the user id | `GuardController.java`, `Role.java`, `Permission.java` | `GuardControllerTest`, `GuardAccessIntegrationTest`, `RbacIntegrationTest`; `SpendGuardPage.test.jsx`: "stays hidden for the demo account…" |
| 17 | The internal key on every guard-service path | `main.py`: the key middleware | `test_api.py`: `test_health_is_public_and_everything_else_needs_the_key`, `test_one_user_cant_reach_anothers_records` |
| 17 | The browser only talks to the backend | `guardApi.js` (calls `/api/v1/guard/*`) | `scripts/check.sh` (scan) |
| 18 | No secrets in Spend Guard files | environment variables and Secret Manager | `scripts/check.sh` (scan) |
