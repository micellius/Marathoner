/**
 * Created in SAP Labs Israel.
 * Author: Vadim Tomnikov (i070970)
 * Date: 12/16/13
 * Time: 4:28 PM
 */
describe('Site Service:', function() {

    var HCP,    // HANA Cloud Portal API
        config, // Test configuration
        hcp;    // Configured instance of HANA Cloud Portal API

    HCP = require('../lib/api.js');
    config = require('../lib/config.js');

    beforeEach(function() {
        hcp = new HCP(config);
    });

    it('Site CRUD and publishing', function(done) {
        var ts = (new Date()).getTime();

        // Log-in
        hcp.logIn(function() {
            /*
             * @transactionStart createSite
             * @transactionStart createAndPublishSite
             */
            // Create site
            hcp.createSite({
                name: 'JasmineTestSiteName_' + ts,
                description: 'JasmineTestSiteDescription_' + ts
            }, function(response, createSiteResponse) {
                expect(createSiteResponse.status).toBe('OK');
                expect(createSiteResponse.site).toBeDefined();
                expect(createSiteResponse.site.ID).toBeDefined();
                // Get site
                hcp.getSite({
                    siteId: createSiteResponse.site.ID
                }, function(response, getSiteResponse) {
                    expect(getSiteResponse.status).toBe('OK');
                    expect(getSiteResponse.siteVersion).toBeDefined();
                    /*
                     * @transactionEnd createSite
                     */
                    // Update site
                    hcp.updateSite({
                        siteId: createSiteResponse.site.ID,
                        siteVersion: getSiteResponse.siteVersion,
                        name: 'JasmineTestSiteUpdatedName_' + ts,
                        description: 'JasmineTestSiteUpdatedDescription_' + ts
                    }, function(response, updateSiteResponse) {
                        expect(updateSiteResponse.status).toBe('OK');
                        expect(updateSiteResponse.siteVersion).toBeDefined();
                        expect(updateSiteResponse.siteVersion).not.toEqual(getSiteResponse.siteVersion);
                        // Publish site
                        hcp.publishSite({
                            siteId: createSiteResponse.site.ID,
                            siteVersion: updateSiteResponse.siteVersion
                        }, function(response, publishSiteResponse) {
                            expect(publishSiteResponse.status).toBe('OK');
                            /*
                             * @transactionEnd createAndPublishSite
                             */
                            // Unpublish site
                            hcp.unpublishSite({
                                siteId: createSiteResponse.site.ID,
                                siteVersion: updateSiteResponse.siteVersion
                            }, function(response, unpublishSiteResponse) {
                                expect(unpublishSiteResponse.status).toBe('OK');
                                // Delete site
                                hcp.deleteSite({
                                    siteId: createSiteResponse.site.ID,
                                    siteVersion: updateSiteResponse.siteVersion
                                }, function(response, deleteSiteResponse) {
                                    expect(deleteSiteResponse.status).toBe('OK');
                                    done();
                                });
                            });
                        });
                    });
                });
            });
        });
    });

});