// const envs = `MitchDev|http://10.1.1.56:4300/|http://10.1.1.56:4200/|http://10.1.1.56/venue|false|v2
// mitchdev|https://mitchdev.commondesk.info|https://mitchdev.commondesk.info|https://mitchdev.commondesk.info/venue|false|v2
// mitchcddev1|https://cddevweb1.ngrok.io|https://cddevweb1.ngrok.io|https://cddevservice1.ngrok.io/venue|false|v2
// mitchcddev2|https://cddevweb2.ngrok.io|https://cddevweb2.ngrok.io|https://cddevservice2.ngrok.io/venue|false|v2
// MitchDev2|http://10.1.1.160:4300/|http://10.1.1.160:4200/|http://10.1.1.160:5172/venue|false|v2
// mitchtest|https://mitchtest.commondesk.info|https://mitchtest.commondesk.info|https://mitchtest.commondesk.info/venue|false|v2
// JuanLocalDev|http://192.168.0.101:4300|http://192.168.0.101:4200|http://192.168.0.101:5172/venue|false|v2
// JuanMacbookDev|http://192.168.0.107:4300|http://192.168.0.107:4200|http://192.168.0.107:5172/venue|false|v2`;

// sp=r&st=2019-10-31T22:05:55Z&se=2025-11-01T06:05:55Z&spr=https&sv=2019-02-02&sr=b&sig=lGC9H0jYbYhkyiFeC9GRRncHOS40J77kUBH3iPFAqnw%3D
// https://venuestorageaccount.blob.core.windows.net/venuesyncservice/RefindEnvironments.txt?sp=r&st=2019-10-31T22:05:55Z&se=2025-11-01T06:05:55Z&spr=https&sv=2019-02-02&sr=b&sig=lGC9H0jYbYhkyiFeC9GRRncHOS40J77kUBH3iPFAqnw%3D

var environmentsBlobUrl = 'https://venuestorageaccount.blob.core.windows.net/venuesyncservice/RefindEnvironments.txt';

const NAME_PART = 0;
const LIGHT_PORTAL_HOST = 1;
const FULL_PORTAL_HOST = 2;
const SERVICE_PART = 3;
const STATUS_PART = 4;
const VERSION_PART = 5;
const INSERT_ROW_INDEX = -1; // -1 means insert at bottom/end
const INSERT_COLUMN_INDEX = 0; // 0 means at the beginning/start


async function isEnvironmentUrlValid(environment) {

    const ligthPortalHost = environment[LIGHT_PORTAL_HOST];
    const fullPortalHost = environment[FULL_PORTAL_HOST];
    const servicePart = environment[SERVICE_PART];

    if (ligthPortalHost.indexOf('localhost') !== -1) return true;

    if (ligthPortalHost.indexOf('https') === -1) {
        return false;
    }

    try {
        const lightPortal = await fetch(ligthPortalHost, { method: "HEAD" });
        if (lightPortal.status !== 200) return false;

    } catch (error) {
        return false;
    }

    if (fullPortalHost.indexOf('https') === -1) {
        return false;
    }

    try {
        const fullPortal = await fetch(fullPortalHost, { method: "HEAD" });
        if (fullPortal.status !== 200) return false;

    } catch (error) {

        return false;
    }

    if (servicePart.indexOf('https') === -1) {
        return false;
    }

    try {
        const service = await fetch(servicePart, { method: "HEAD" });
        if (service.status !== 200) return false;
    } catch (error) {

        return false;
    }

    return true;
}

function loadEnvironmentList() {

    var table = document.getElementById("environments");

    if (!table) {
        console.log("Did not find table with id 'environments'");
        return;
    }

    $.get({ url: environmentsBlobUrl, cache: false }, {

    }).then(function (result) {

        console.log(result);
        console.log("Loading list of environments");
        var theEnvs = result.split("\n");
        //console.log(theEnvs);

        // Generate the rows based on the environments we got 
        for (i = 0; i < theEnvs.length; i++) {

            var currentEnvParts = theEnvs[i].split("|");

            if (currentEnvParts === "") continue;

            // If the environment is not v2 we can't use it, ev1 on amazon is v1 and not compatible with the extension 
            if (currentEnvParts[NAME_PART] != '' && currentEnvParts[VERSION_PART] != 'v1') {
                console.log(`Env name=[${currentEnvParts[NAME_PART]}] Version=${currentEnvParts[VERSION_PART]}`);

                console.log(`adding env [${currentEnvParts[NAME_PART]}]`);
                var currentRow = table.insertRow(INSERT_ROW_INDEX);

                var serviceCell = currentRow.insertCell(INSERT_COLUMN_INDEX);
                serviceCell.innerHTML = currentEnvParts[SERVICE_PART];

                var fullPortalHostCell = currentRow.insertCell(INSERT_COLUMN_INDEX);
                fullPortalHostCell.innerHTML = currentEnvParts[FULL_PORTAL_HOST];

                var ligthPortalCell = currentRow.insertCell(INSERT_COLUMN_INDEX);
                ligthPortalCell.innerHTML = currentEnvParts[LIGHT_PORTAL_HOST];

                var envNameCell = currentRow.insertCell(INSERT_COLUMN_INDEX);
                envNameCell.innerHTML = currentEnvParts[NAME_PART];

                let statusCell = currentRow.insertCell(STATUS_PART);

                isEnvironmentUrlValid(currentEnvParts).then(result => {
                    statusCell.innerHTML = result ? "Online" : "Offline";
                    statusCell.setAttribute("style", `color:${result ? 'green' : 'red'};`);
                }).catch(console.log);

                var createClickHandler = (row) => {
                    return () => {
                        var envNameCell = row.getElementsByTagName("td")[0];
                        var envName = envNameCell.innerHTML;

                        var statusCell = row.getElementsByTagName("td")[STATUS_PART];
                        var status = statusCell.innerHTML;
                        if (status !== "Online") {
                            alert("The selected environment is Offline, please select an Online environment");
                            return;
                        }

                        // Switch to the selected environment
                        if (confirm(`Switch to Environment ${envName}?`)) {

                            var portalNameCell = row.getElementsByTagName("td")[NAME_PART];
                            var portalName = portalNameCell.innerHTML;

                            var portalHostCell = row.getElementsByTagName("td")[LIGHT_PORTAL_HOST];
                            var portalHost = portalHostCell.innerHTML;

                            var fullPortalHostCell = row.getElementsByTagName("td")[FULL_PORTAL_HOST];
                            var fullPortalHost = fullPortalHostCell.innerHTML;

                            var serviceHostCell = row.getElementsByTagName("td")[SERVICE_PART];
                            var serviceHost = serviceHostCell.innerHTML;

                            console.log(`Selected Environment:Name=[${envName}]:portalHost=[${portalHost}]:fullPortalHost=[${fullPortalHost}]:serviceHost=[${serviceHost}]`);
                            chrome.storage.local.set({
                                fullPortalHost,
                                portalHost: portalHost,
                                serviceHost,
                                environment: portalName,
                                //userAccountId: "",    
                                //userEmail: "",
                                isValidSession: false,
                                switchedEnvironment: true
                            }, function () {
                                alert(`Completed switch to environment ${envName}`);
                                close();
                            });
                        }
                    };
                };

                currentRow.onclick = createClickHandler(currentRow);
            }
        }
    });
}

// Load and display the environments after the window finishes loading
window.onload = loadEnvironmentList();