Feature: Evaluate target progress and highlight events needing attention
  As an Events Team Manager
  I want struggling upcoming events flagged automatically at the top of the page
  So that my team can prioritize outreach and pending approvals immediately

  Scenario Outline: Classify event urgency based on days remaining and percentage of target met
    Given the current reference date is "<today>"
    And an event "<event_id>" is scheduled for "<event_date>" with a target of <target> registrations
    And the event has <confirmed> confirmed registrations
    When the attention rules evaluate "<event_id>"
    Then the progress percentage should be "<pct>%"
    And the event status badge should be "<expected_badge>"
    And the needs-attention flag should be "<needs_attention>"

    Examples:
      | today      | event_id | event_date | target | confirmed | pct | expected_badge            | needs_attention |
      | 2026-11-16 | E130     | 2026-11-19 | 25     | 4         | 16  | Needs Attention (Urgent)  | true            |
      | 2026-11-16 | E126     | 2026-11-19 | 30     | 9         | 30  | Needs Attention (Urgent)  | true            |
      | 2026-11-16 | E101     | 2026-11-19 | 60     | 36        | 60  | Needs Attention (Urgent)  | true            |
      | 2026-11-16 | E125     | 2026-11-18 | 50     | 36        | 72  | Needs Attention (Behind)  | true            |
      | 2026-11-16 | E141     | 2026-11-26 | 30     | 31        | 103 | Target Met                | false           |
      | 2026-11-16 | E150     | 2027-02-24 | 300    | 40        | 13  | On Track                  | false           |
      | 2026-11-16 | E114     | 2026-11-10 | 45     | 42        | 93  | Completed                 | false           |

  Scenario: Exclude past events from active "Needs Attention" alerts
    Given event "E114" ("Platform Engineering Dinner") took place on "2026-11-10"
    And the current date is after "2026-11-10"
    When the dashboard sorts and prioritizes events
    Then "E114" should be marked as "Completed"
    And "E114" should not appear in the top "Action Required" alert banner