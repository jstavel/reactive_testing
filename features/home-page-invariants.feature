@plan:smoke
Feature: Home Page invariants

  # Structural guarantees that must hold on the Home Page at all times.
  # Checked by the Orchestrator after every action (model invariants).

  Scenario: Main navigation is visible
    Given I am on the Kraken Pro home page
    Then the main navigation is visible with the items:
      | History   |
      | Portfolio |

  Scenario: Portfolio value is displayed in the header
    Given I am on the Kraken Pro home page
    Then the portfolio value is displayed in the header

  Scenario: No error overlay is present
    Given I am on the Kraken Pro home page
    Then no error overlay is displayed
