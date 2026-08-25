Feature: Home page portfolio value

  Scenario: Current portfolio value agrees across Home surfaces
    Given I am on the Kraken Pro home page
    Then the portfolio value shown in the header matches the portfolio value shown in the body
