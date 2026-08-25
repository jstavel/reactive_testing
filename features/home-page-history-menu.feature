@plan:smoke
Feature: Home page History menu

  # Menu opens via hover in the UI; the mechanism is an implementation detail,
  # not a model-level concern. Steps below focus on the contracts (clicks).

  Scenario: History menu contains the expected items
    Given I am on the Kraken Pro home page
    When I open the History menu
    Then the History menu contains the items:
      | Main    |
      | Futures |
      | Earn    |

  Scenario: Clicking Main opens the History page for the Main account
    Given I am on the Kraken Pro home page
    When I click "Main" in the History menu
      # menu item locator: //a[@role="menuitem" and normalize-space(text())="Main"]
    Then the History page is displayed at "/app/history/main/ledger"
      # note: /app/history/<account>/<sub-view> - "Main" opens with "Ledger" preselected
    And the "Ledger" sub-view is selected within the "Main" history

  Scenario: Clicking Futures opens the History page for the Futures account
    Given I am on the Kraken Pro home page
    When I click "Futures" in the History menu
      # menu item locator: //a[@role="menuitem" and normalize-space(text())="Futures"]
    Then the History page is displayed at "/app/history/derivatives/ledger"
      # note: URL slug is "derivatives", not "futures"
    And the "Ledger" sub-view is selected within the "Futures" history
