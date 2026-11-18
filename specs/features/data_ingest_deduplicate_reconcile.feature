Feature: Reconcile live CSV registrations with nightly event targets
  As an Event Coordinator
  I want the dashboard to combine live CSV exports with the master event schedule accurately
  So that every event displays trustworthy headcounts without double-counting duplicate submissions

  Background:
    Given the master event schedule is loaded from "public/events.json"
    And the live registration export is loaded from "public/registrations.csv"

  Scenario: Map live CSV registrations to events using the event ID prefix
    Given "public/registrations.csv" contains rows with event labels like "E125 Identity Leaders Roundtable SYD"
    When the dashboard processes the registration rows
    Then it should extract the leading event ID "E125"
    And group all matching rows under event "E125" from "public/events.json"
    And count registrations separately by status "Accepted", "Pending", and "Cancelled"

  Scenario: Filter out duplicate double-submissions by default
    Given "public/registrations.csv" contains two rows for "Arjun Nguyen" on event "E101"
    And both rows share the same normalized mobile "0483930103" and timestamp "2026-10-11T09:32:00+11:00"
    When deduplication is active
    Then only 1 registration should be counted for "Arjun Nguyen" on "E101"
    And the duplicate submission counter should increment by 1

  Scenario: Preserve distinct registrations for people with the same name
    Given "public/registrations.csv" contains two rows for "Daniel Khan" on event "E101"
    And row "R1072" has timestamp "2026-10-26T16:56:00+11:00" and mobile "0495214562"
    And row "R1082" has timestamp "2026-10-20T10:04:00+11:00" and mobile "0407661771"
    When deduplication is active
    Then both rows should be kept as separate registrations for "E101"

  Scenario: Fall back to nightly snapshot when an event is absent from the live CSV
    Given event "E126" ("Identity Leaders Roundtable", Melbourne) exists in "public/events.json" with target 30 and current_registrations 9
    And "E126" has no rows in "public/registrations.csv"
    When the dashboard renders the summary for "E126"
    Then it should use 9 as the confirmed progress count against the target of 30
    And it should indicate that individual "Accepted", "Pending", and "Cancelled" breakdowns are unavailable
    And it should not display "0" for Pending or Cancelled counts

  Scenario: Handle null registration counts safely without crashing or misreporting
    Given event "E155" ("Data Governance Roundtable", Auckland) has "current_registrations" set to null in "public/events.json"
    And "E155" has no rows in "public/registrations.csv"
    When the dashboard renders the summary for "E155"
    Then the progress bar should default to 0 of 25 (0%)
    And the card should display a "No registration data reported" label