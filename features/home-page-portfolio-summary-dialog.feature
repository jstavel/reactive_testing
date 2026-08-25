Feature: Home page Portfolio Summary dialog

  Scenario: Clicking the portfolio value opens the Portfolio Summary dialog
    Given I am on the Kraken Pro home page
    When I click the portfolio value shown in the header
      # unique locator: header button matching /\d[\d,.]*\s*USD/, e.g. "4,977.93 USD"
    Then the Portfolio Summary dialog opens showing the total portfolio value in USD
    And the dialog shows a section for each wallet:
      | Main    |
      | Spot    |
      | Margin  |
      | Futures |
      | Loans   |
      | Earn    |

  Scenario: Pressing Escape closes the Portfolio Summary dialog
    Given I am on the Kraken Pro home page
    And the Portfolio Summary dialog is open
    When I press "Escape"
    Then the Portfolio Summary dialog is closed

  Scenario: The eye icon toggles value visibility immediately
    Given I am on the Kraken Pro home page
    And the Portfolio Summary dialog is open
    When I click the eye icon in the dialog header
      # unique locator: //div[@role="dialog"]//button[.//svg[@name="EyeOff" or @name="Eye"]]
      # the icon shows "EyeOff" while values are visible and "Eye" while they are hidden
    Then the values become hidden if the icon was showing "EyeOff"
    And the values become visible again if the icon was showing "Eye"
