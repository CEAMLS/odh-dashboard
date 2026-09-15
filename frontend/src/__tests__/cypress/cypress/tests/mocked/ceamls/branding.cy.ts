import { appChrome } from '#~/__tests__/cypress/cypress/pages/appChrome';
import { aboutDialog } from '#~/__tests__/cypress/cypress/pages/aboutDialog';

// CEAMLS: the dashboard is branded "CEAMLS Data Hub" with the console's logos
// (frontend/.env ODH_PRODUCT_NAME, ODH_LOGO, ODH_LOGO_DARK, ODH_FAVICON).

describe('CEAMLS branding', () => {
  it('uses the CEAMLS name, logo and favicon', () => {
    appChrome.visit();

    cy.title().should('eq', 'CEAMLS Data Hub');
    cy.get('link[rel="icon"]')
      .should('have.attr', 'href')
      .and('match', /ceamls-favicon\.png$/);
    cy.get('.odh-dashboard__brand')
      .should('have.attr', 'alt', 'CEAMLS Data Hub')
      .and('have.attr', 'src')
      .and('match', /\/images\/ceamls-logo\.png$/);
    cy.get<HTMLImageElement>('.odh-dashboard__brand').should(($img) => {
      // The image loaded, and the masthead scales it to its 38px logo height.
      expect($img[0].naturalWidth).to.be.greaterThan(0);
      expect($img[0].getBoundingClientRect().height).to.be.within(1, 38.5);
    });
  });

  it('names CEAMLS Data Hub in the about modal', () => {
    cy.interceptOdh('GET /api/operator-subscription-status', {
      channel: 'fast',
      lastUpdated: '2024-06-25T05:36:37Z',
    });
    cy.interceptOdh('GET /api/dsci/status', {
      conditions: [],
      release: {
        version: '1.0.1',
      },
    });
    appChrome.visit();
    aboutDialog.show();

    cy.findByRole('dialog').findByRole('heading', { name: 'CEAMLS Data Hub' }).should('exist');
  });
});
