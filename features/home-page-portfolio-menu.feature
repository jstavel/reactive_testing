Feature: Home page Portfolio menu

  # Menu opens via hover in the UI; the mechanism is an implementation detail,
  # not a model-level concern. Steps below focus on the contracts (clicks).

  Scenario: Portfolio menu contains the expected items
    Given I am on the Kraken Pro home page
    When I open the Portfolio menu
    Then the Portfolio menu contains the items:
      | Overview       |
      | Main           |
      | TradFi futures |
      | Futures        |
      | Earn           |
      | Loans          |

  Scenario: Clicking Overview opens the Portfolio page with the Overview view
    Given I am on the Kraken Pro home page
    When I click "Overview" in the Portfolio menu
      # menu item locator: //a[@role="menuitem" and normalize-space(text())="Overview"]
    Then the Portfolio page is displayed at "/app/portfolio/overview"
    And the "Overview" view is selected

  Scenario: Clicking Main opens the Portfolio page with the Main view
    Given I am on the Kraken Pro home page
    When I click "Main" in the Portfolio menu
      # menu item locator: //a[@role="menuitem" and normalize-space(text())="Main"]
    Then the Portfolio page is displayed at "/app/portfolio/main"
    And the "Main" view is selected

  Scenario: Clicking Futures opens the Portfolio page with the Futures view
    Given I am on the Kraken Pro home page
    When I click "Futures" in the Portfolio menu
      # menu item locator: //a[@role="menuitem" and normalize-space(text())="Futures"]
    Then the Portfolio page is displayed at "/app/portfolio/derivatives"
      # note: URL slug is "derivatives", not "futures"
    And the "Futures" view is selected

  Scenario: Clicking Loans opens the Portfolio page with the Loans view
    Given I am on the Kraken Pro home page
    When I click "Loans" in the Portfolio menu
      # menu item locator: //a[@role="menuitem" and normalize-space(text())="Loans"]
    Then the Portfolio page is displayed at "/app/portfolio/loans"
    And the "Loans" view is selected

  Scenario: Clicking Earn navigates to the standalone Earn page
    Given I am on the Kraken Pro home page
    When I click "Earn" in the Portfolio menu
      # menu item locator: //a[@role="menuitem" and normalize-space(text())="Earn"]
    Then the application navigates to "/app/earn"
      # note: breaks the /app/portfolio/<view> schema - Earn is a standalone page,
      # not one of the Portfolio page views
