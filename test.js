const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function scrapeDoctolib() {
  let context; // BrowserContext for persistent session
  let page;
  const acceptCookies = false; // Toggle this to true/false to enable/disable cookie acceptance
  const clearSession = true; // Set to true to clear browser data and force fresh login
 
  try {
    const userDataDir = path.join(__dirname, 'user_data');
   
    // Clear browser data if clearSession is true
    if (clearSession) 
      console.log('🧹 Clearing browser session data for fresh login...');@


    
      try {
        if (fs.existsSync(userDataDir)) {
          fs.rmSync(userDataDir, { recursive: true, force: true });
          console.log('✅ Browser data cleared successfully.');
        } else {
          console.log('ℹ️ No existing browser data found to clear.');
        }
      } catch (error) {
        console.warn('⚠️ Warning: Could not clear browser data:', error.message);
        console.log('Proceeding anyway...');
      }
    }
   
    console.log(`Launching browser with persistent user data directory: ${userDataDir}`);

    // Launch the browser with a persistent context to maintain login sessions
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      slowMo: 100,
      channel: 'chrome',
      viewport: { width: 1400, height: 900 } // Ensure viewport is large enough
    });

    // Use the existing page or create a new one
    const pages = context.pages();
    if (pages.length > 0) {
      page = pages[0];
      console.log('Using existing page from persistent context.');
    } else {
      page = await context.newPage();
      console.log('Creating new page in persistent context.');
    }

    // --- 1. LOGIN OR NAVIGATE ---
    // Check if we are already on the calendar page. If not, navigate and log in.
    if (!page.url().includes('pro.doctolib.fr/calendar')) {
      console.log('Not on the calendar page. Starting login process...');
      await page.goto('https://pro.doctolib.fr/signin', { waitUntil: 'domcontentloaded', timeout: 60000 });

      // Double-check if the navigation immediately redirected to the calendar (already logged in)
      if (page.url().includes('pro.doctolib.fr/calendar')) {
        console.log('Detected that the browser is already logged in. Skipping login steps.');
      } else {
        // --- Handle Cookie Consent (Improved) ---
        console.log('Checking for cookie consent dialog...');
        try {
          // Look for the Didomi cookie popup with multiple selectors
          const cookiePopupSelectors = [
            '.didomi-popup-container',
            '.didomi-popup-notice',
            'div[role="dialog"][aria-label*="consentement"]',
            'div[data-testid="notice"]'
          ];
         
          let cookiePopupFound = false;
         
          for (const popupSelector of cookiePopupSelectors) {
            try {
              const cookiePopup = page.locator(popupSelector).first();
              await cookiePopup.waitFor({ state: 'visible', timeout: 8000 });
              console.log(`Cookie consent popup found with selector: ${popupSelector}`);
              cookiePopupFound = true;
             
              if (acceptCookies) {
                // Try to click "Accepter" button
                const acceptButtonSelectors = [
                  'button#didomi-notice-agree-button',
                  'button:has-text("Accepter")',
                  '.didomi-dismiss-button',
                  '.didomi-button:has-text("Accepter")'
                ];
               
                let buttonClicked = false;
                for (const buttonSelector of acceptButtonSelectors) {
                  try {
                    const acceptButton = page.locator(buttonSelector).first();
                    await acceptButton.waitFor({ state: 'visible', timeout: 3000 });
                    console.log(`Clicking "Accepter" button with selector: ${buttonSelector}`);
                    await acceptButton.click();
                    buttonClicked = true;
                    break;
                  } catch (error) {
                    continue;
                  }
                }
               
                if (buttonClicked) {
                  console.log('✅ Cookie consent accepted.');
                } else {
                  console.warn('Could not find "Accepter" button. Trying to close popup.');
                }
              } else {
                // Try to close the popup without accepting
                const closeButtonSelectors = [
                  '.didomi-popup-close',
                  'a[aria-label*="Fermer"]',
                  'button#didomi-notice-disagree-button',
                  'button:has-text("Refuser")',
                  '.didomi-disagree-button'
                ];
               
                let popupClosed = false;
                for (const closeSelector of closeButtonSelectors) {
                  try {
                    const closeButton = page.locator(closeSelector).first();
                    await closeButton.waitFor({ state: 'visible', timeout: 3000 });
                    console.log(`Closing cookie popup with selector: ${closeSelector}`);
                    await closeButton.click();
                    popupClosed = true;
                    break;
                  } catch (error) {
                    continue;
                  }
                }
               
                if (popupClosed) {
                  console.log('✅ Cookie consent popup closed.');
                } else {
                  console.warn('Could not close cookie popup. Trying Escape key.');
                  await page.keyboard.press('Escape');
                }
              }
             
              // Wait for popup to disappear
              await page.waitForTimeout(3000);
              break;
             
            } catch (error) {
              continue;
            }
          }
         
          if (!cookiePopupFound) {
            console.log('No cookie consent popup found. Proceeding with login.');
          }
         
        } catch (error) {
          console.warn('Error handling cookie consent popup:', error);
          console.log('Attempting to continue with login...');
        }

        // --- Perform Login with PIN Support ---
      
        console.log('Analyzing login form structure...');
       
        // Check for PIN input fields first
        const pinInputSelector = 'input[name^="pin["]';
        let isPinLogin = false;
        
        try {
          const pinInputs = page.locator(pinInputSelector);
          await pinInputs.first().waitFor({ state: 'visible', timeout: 5000 });
          const pinInputCount = await pinInputs.count();
          
          if (pinInputCount >= 4) {
            isPinLogin = true;
            console.log('PIN login form detected.');
          }
        } catch (error) {
          console.log('PIN inputs not found, checking for standard login form...');
        }
        
        if (isPinLogin) {
          // --- Handle PIN Login ---
          console.log('=== PIN LOGIN MODE ===');
          
          if (DOCTOLIB_PIN.length !== 4) {
            throw new Error('PIN must be exactly 4 digits');
          }
          
          console.log('Entering PIN...');
          
          // Fill each PIN input field
          for (let i = 0; i < 4; i++) {
            const pinInputSelector = `input[name="pin[${i}]"]`;
            const pinInput = page.locator(pinInputSelector);
            await pinInput.waitFor({ state: 'visible', timeout: 5000 });
            await pinInput.fill(DOCTOLIB_PIN[i]);
            console.log(`Entered digit ${i + 1}/4`);
          }
          
          // Look for submit button
          const submitButtonSelectors = [
            'button[type="submit"]',
            'button:has-text("Se connecter")',
            'button:has-text("Connexion")',
            'button:has-text("Valider")',
            '.dl-button-primary'
          ];
          
          let submitButton = null;
          for (const selector of submitButtonSelectors) {
            try {
              submitButton = page.locator(selector).first();
              await submitButton.waitFor({ state: 'visible', timeout: 3000 });
              console.log(`Submit button found with selector: ${selector}`);
              break;
            } catch (error) {
              continue;
            }
          }
          
          if (!submitButton) {
            throw new Error('Could not find submit button for PIN login form');
          }
          
          console.log('Clicking submit button...');
          await submitButton.click();
          
        } else {
          // --- Handle Standard Login (Username/Password) ---
          
          // Wait for the password field to be visible (this should always be present)
          const passwordInput = page.locator('input#password');
          await passwordInput.waitFor({ state: 'visible', timeout: 15000 });
          console.log('Password field found.');
         
          // Check for username field with a reasonable timeout
          const usernameInput = page.locator('input#username');
          let usernameFieldExists = false;
         
          try {
            await usernameInput.waitFor({ state: 'visible', timeout: 5000 });
            usernameFieldExists = true;
            console.log('Username field found - Full login required.');
          } catch (error) {
            console.log('Username field not found - Password-only login detected.');
          }
         
          // Alternative way to detect login type by checking DOM elements
          if (!usernameFieldExists) {
            // Double-check by looking for any input with name="username" or similar
            const alternativeUsernameSelectors = [
              'input[name="username"]',
              'input[name="email"]',
              'input[type="email"]',
              'input[placeholder*="mail" i]',
              'input[placeholder*="utilisateur" i]'
            ];
           
            for (const selector of alternativeUsernameSelectors) {
              try {
                const altUsernameField = page.locator(selector);
                await altUsernameField.waitFor({ state: 'visible', timeout: 2000 });
                console.log(`Alternative username field found with selector: ${selector}`);
                usernameFieldExists = true;
                break;
              } catch (error) {
                // Continue to next selector
              }
            }
          }
         
          // Perform login based on detected form type
          if (usernameFieldExists) {
            // SCENARIO: Full login with username and password
            console.log('=== FULL LOGIN MODE ===');
           
            console.log('Waiting for all login form elements...');
            await usernameInput.waitFor({ state: 'visible' });
            await passwordInput.waitFor({ state: 'visible' });
           
            // Look for submit button with multiple possible selectors
            const submitButtonSelectors = [
              'button[type="submit"].dl-button-primary',
              'button[type="submit"]',
              'button:has-text("Se connecter")',
              'button:has-text("Connexion")',
              '.dl-button-primary'
            ];
           
            let submitButton = null;
            for (const selector of submitButtonSelectors) {
              try {
                submitButton = page.locator(selector).first();
                await submitButton.waitFor({ state: 'visible', timeout: 3000 });
                console.log(`Submit button found with selector: ${selector}`);
                break;
              } catch (error) {
                continue;
              }
            }
           
            if (!submitButton) {
              throw new Error('Could not find submit button for full login form');
            }
 
            console.log('Entering login credentials...');
            await usernameInput.fill(DOCTOLIB_USERNAME);
            await passwordInput.fill(DOCTOLIB_PASSWORD);
 
            console.log('Clicking login button...');
            await submitButton.click();
           
          } else {
            // SCENARIO: Password-only login
            console.log('=== PASSWORD-ONLY LOGIN MODE ===');
           
            console.log('Entering password...');
            await passwordInput.fill(DOCTOLIB_PASSWORD);

            // Look for login button with multiple possible selectors
            const loginButtonSelectors = [
              'button:has-text("Se connecter")',
              'button:has-text("Connexion")',
              'button[type="submit"]',
              '.dl-button-primary'
            ];
           
            let loginButton = null;
            for (const selector of loginButtonSelectors) {
              try {
                loginButton = page.locator(selector).first();
                await loginButton.waitFor({ state: 'visible', timeout: 3000 });
                console.log(`Login button found with selector: ${selector}`);
                break;
              } catch (error) {
                continue;
              }
            }
           
            if (!loginButton) {
              throw new Error('Could not find login button for password-only form');
            }

            console.log('Clicking "Se connecter" button...');
            await loginButton.click();
          }
        }

        // --- Handle 2FA Validation Button ---
        console.log('Checking for 2FA validation button...');
        try {
          // Look for "Valider" button that appears during 2FA process
          const validerButtonSelectors = [
            'button:has-text("Valider")',
            'button .dl-button-label:has-text("Valider")',
            'button[type="submit"]:has-text("Valider")',
            '.dl-button:has-text("Valider")',
            'button:has(.dl-button-label:has-text("Valider"))'
          ];
         
          let validerButtonFound = false;
         
          for (const buttonSelector of validerButtonSelectors) {
            try {
              const validerButton = page.locator(buttonSelector).first();
              await validerButton.waitFor({ state: 'visible', timeout: 10000 });
              console.log(`2FA "Valider" button found with selector: ${buttonSelector}`);
             
              // Wait a moment to ensure the form is ready
              await page.waitForTimeout(1000);
             
              console.log('Clicking "Valider" button for 2FA...');
              await validerButton.click();
              console.log('✅ 2FA "Valider" button clicked successfully.');
              validerButtonFound = true;
              break;
             
            } catch (error) {
              continue;
            }
          }
         
          if (!validerButtonFound) {
            console.log('No 2FA "Valider" button found. This might be a direct login without 2FA.');
          }
         
        } catch (error) {
          console.warn('Error handling 2FA validation button:', error);
          console.log('Continuing with login process...');
        }

        // --- Wait for navigation to calendar (handles post-login/2FA redirect) ---
        console.log('Waiting for navigation to agenda page...');
        try {
            await page.waitForURL(/pro.doctolib.fr\/calendar/i, { waitUntil: 'networkidle', timeout: 900000 });
            console.log(`Successfully navigated to agenda page. Current URL: ${page.url()}`);
        } catch (error) {
            console.error('CRITICAL ERROR: Failed to navigate to the agenda page after login attempt.', error);
            await page.screenshot({ path: 'login_or_agenda_navigation_error.png' });
            throw new Error('Failed to complete login or navigate to agenda. Cannot proceed.');
        }
       
        // --- Handle Identity Verification Modal (CPS) ---
        console.log('Checking for identity verification modal...');
        try {
          // Look for the modal with the identity verification message
          const identityModalSelectors = [
            '.dl-modal-content:has-text("Confirmez votre identité")',
            '.dl-modal-content:has-text("vérification")',
            'div[class*="modal"]:has-text("CPS")',
            '.dl-modal-content'
          ];
         
          let modalFound = false;
         
          for (const modalSelector of identityModalSelectors) {
            try {
              const modal = page.locator(modalSelector).first();
              await modal.waitFor({ state: 'visible', timeout: 5000 });
              console.log(`Identity verification modal found with selector: ${modalSelector}`);
              modalFound = true;
             
              // Look for the close button (X) in the modal
              const closeButtonSelectors = [
                '.dl-modal-close-icon button',
                'button[aria-label="Fermer"]',
                '.dl-modal-content button:has-text("×")',
                '.dl-modal-content .dl-icon:has([data-icon-name*="xmark"])',
                '.dl-modal-close-icon',
                'button:has(.dl-icon[data-icon-name*="xmark"])'
              ];
             
              let modalClosed = false;
             
              for (const closeSelector of closeButtonSelectors) {
                try {
                  const closeButton = page.locator(closeSelector).first();
                  await closeButton.waitFor({ state: 'visible', timeout: 3000 });
                  console.log(`Close button found with selector: ${closeSelector}`);
                  await closeButton.click();
                  console.log('✅ Identity verification modal closed successfully.');
                  modalClosed = true;
                  break;
                } catch (error) {
                  continue;
                }
              }
             
              if (!modalClosed) {
                // Fallback: Try pressing Escape key
                console.log('Close button not found, trying Escape key...');
                await page.keyboard.press('Escape');
                console.log('✅ Attempted to close modal with Escape key.');
              }
             
              // Wait a moment for the modal to disappear
              await page.waitForTimeout(2000);
              break;
             
            } catch (error) {
              continue;
            }
          }
         
          if (!modalFound) {
            console.log('No identity verification modal found. Proceeding to scrape.');
          }
         
        } catch (error) {
          console.warn('Error handling identity verification modal:', error);
          console.log('Attempting to continue with scraping...');
        }
      }
    } else {
        console.log('Already on the calendar page. Proceeding to scrape.');
        await page.reload({ waitUntil: 'networkidle' });
        console.log('Page reloaded to ensure fresh state.');
       
        // --- Handle Identity Verification Modal (CPS) even when already on calendar ---
        console.log('Checking for identity verification modal after reload...');
        try {
          // Look for the modal with the identity verification message
          const identityModalSelectors = [
            '.dl-modal-content:has-text("Confirmez votre identité")',
            '.dl-modal-content:has-text("vérification")',
            'div[class*="modal"]:has-text("CPS")',
            '.dl-modal-content'
          ];
         
          let modalFound = false;
         
          for (const modalSelector of identityModalSelectors) {
            try {
              const modal = page.locator(modalSelector).first();
              await modal.waitFor({ state: 'visible', timeout: 5000 });
              console.log(`Identity verification modal found with selector: ${modalSelector}`);
              modalFound = true;
             
              // Look for the close button (X) in the modal
              const closeButtonSelectors = [
                '.dl-modal-close-icon button',
                'button[aria-label="Fermer"]',
                '.dl-modal-content button:has-text("×")',
                '.dl-modal-content .dl-icon:has([data-icon-name*="xmark"])',
                '.dl-modal-close-icon',
                'button:has(.dl-icon[data-icon-name*="xmark"])'
              ];
             
              let modalClosed = false;
             
              for (const closeSelector of closeButtonSelectors) {
                try {
                  const closeButton = page.locator(closeSelector).first();
                  await closeButton.waitFor({ state: 'visible', timeout: 3000 });
                  console.log(`Close button found with selector: ${closeSelector}`);
                  await closeButton.click();
                  console.log('✅ Identity verification modal closed successfully.');
                  modalClosed = true;
                  break;
                } catch (error) {
                  continue;
                }
              }
             
              if (!modalClosed) {
                // Fallback: Try pressing Escape key
                console.log('Close button not found, trying Escape key...');
                await page.keyboard.press('Escape');
                console.log('✅ Attempted to close modal with Escape key.');
              }
             
              // Wait a moment for the modal to disappear
              await page.waitForTimeout(2000);
              break;
             
            } catch (error) {
              continue;
            }
          }
         
          if (!modalFound) {
            console.log('No identity verification modal found. Proceeding to scrape.');
          }
         
        } catch (error) {
          console.warn('Error handling identity verification modal:', error);
          console.log('Attempting to continue with scraping...');
        }
    }

    // --- 2. SCRAPE APPOINTMENTS ---
    const appointmentsData = [];
    // This selector targets the clickable appointment blocks on the calendar
    const appointmentSelector = 'div.dc-event-inner';

    console.log('Waiting for appointment elements on the calendar...');
    try {
      await page.waitForSelector(appointmentSelector, { state: 'visible', timeout: 45000 });
      console.log('Appointment elements are visible on the calendar.');
    } catch (error) {
      console.warn('No appointment elements found on the main calendar page. The day might be empty.');
      console.log('✅ Script finished (no appointments found).');
      await context.close();
      return;
    }

    const appointmentLocators = page.locator(appointmentSelector);
    const appointmentCount = await appointmentLocators.count();
    console.log(`Found ${appointmentCount} appointments to process.`);

    // --- Loop through each appointment (UPDATED) ---
    for (let i = 0; i < appointmentCount; i++) {
      const currentAppointment = appointmentLocators.nth(i);
      let patientName = 'Unknown Patient';
      let appointmentTime = 'Unknown Time';
      let appointmentDate = 'Unknown Date';
      let phoneNumber = 'N/A';

      try {
        // Extract patient name and time from the appointment block on the calendar
        const lastName = await currentAppointment.locator('[data-appointment-last-name]').getAttribute('data-appointment-last-name');
        const firstName = await currentAppointment.locator('[data-appointment-first-name]').getAttribute('data-appointment-first-name');
        appointmentTime = await currentAppointment.locator('[data-event-time]').getAttribute('data-event-time');
        patientName = `${lastName || ''} ${firstName || ''}`.trim();

        console.log(`\n--- Processing appointment ${i + 1}/${appointmentCount}: "${patientName}" at ${appointmentTime} ---`);

        // Click the appointment to open the details sidebar
        console.log(`Clicking on appointment for "${patientName}"...`);
        await currentAppointment.click();

        // Wait for the sidebar to become visible
        const sidebarSelector = 'div.dl-left-navigation-bar';
        const sidebar = page.locator(sidebarSelector);
        await sidebar.waitFor({ state: 'visible', timeout: 20000 });
        console.log('Sidebar is visible.');

        // --- Extract the full date from the sidebar ---
        const dateInputSelector = 'input[name="appointment[start_date]"]';
        try {
          const dateInput = sidebar.locator(dateInputSelector);
          await dateInput.waitFor({ state: 'visible', timeout: 10000 });
          appointmentDate = await dateInput.getAttribute('value');
          console.log(`✅ Full date found: ${appointmentDate}`);
        } catch (error) {
          console.warn(`⚠️ Could not find the full date input for "${patientName}".`);
        }

        // --- UPDATED: Click "Infos administratives" button ---
        console.log('Looking for "Infos administratives" section...');
        try {
          // Look for the button with the specific structure you provided
          const infosAdminButtonSelectors = [
            // Primary selector based on your HTML structure
            'span.dl-button-label:has(h3:has-text("Infos administratives"))',
            // Alternative selectors for robustness
            'button:has(h3:has-text("Infos administratives"))',
            'button:has(.dl-button-label:has(h3:has-text("Infos administratives")))',
            '.dl-button-label:has(h3:has-text("INFOS ADMINISTRATIVES"))',
            // Fallback selectors
            'button[name="Infos administratives-caret"]',
            'button[data-test-id="Infos administratives-caret"]',
            'button:has-text("Infos administratives")',
            'button:has(svg[data-icon-name="solid/triangle-exclamation"])'
          ];
          
          let infosButtonClicked = false;
          for (const buttonSelector of infosAdminButtonSelectors) {
            try {
              const infosButton = sidebar.locator(buttonSelector);
              await infosButton.waitFor({ state: 'visible', timeout: 5000 });
              console.log(`"Infos administratives" button found with selector: ${buttonSelector}`);
              await infosButton.click();
              console.log('✅ "Infos administratives" section expanded.');
              infosButtonClicked = true;
              break;
            } catch (error) {
              continue;
            }
          }
          
          if (!infosButtonClicked) {
            console.warn('Could not find "Infos administratives" button. Phone number might already be visible.');
          }
          
          // Wait for the section to expand
          await page.waitForTimeout(2000);
          
        } catch (error) {
          console.warn('Error expanding "Infos administratives" section:', error);
        }

        // --- UPDATED: Extract the phone number from the input field ---
        console.log('Looking for phone number...');
        try {
          // Primary selector for the phone input field based on your HTML structure
          const phoneInputSelectors = [
            'input#phone_number',
            'input[placeholder="Téléphone portable"]',
            'input[title="Téléphone portable"]',
            'input[type="tel"]',
            // Alternative selectors
            'a[href^="tel:"]'
          ];
          
          let phoneFound = false;
          
          for (const phoneSelector of phoneInputSelectors) {
            try {
              if (phoneSelector === 'a[href^="tel:"]') {
                // Handle the tel: link
                const phoneLink = sidebar.locator(phoneSelector);
                await phoneLink.waitFor({ state: 'visible', timeout: 10000 });
                const href = await phoneLink.getAttribute('href');
                if (href) {
                  phoneNumber = href.replace('tel:', '').replace(/\s/g, '');
                  console.log(`✅ Phone number found from tel link: ${phoneNumber}`);
                  phoneFound = true;
                  break;
                }
              } else {
                // Handle input fields
                const phoneInput = sidebar.locator(phoneSelector);
                await phoneInput.waitFor({ state: 'visible', timeout: 10000 });
                const value = await phoneInput.getAttribute('value');
                if (value && value.trim() !== '') {
                  phoneNumber = value.trim();
                  console.log(`✅ Phone number found from input: ${phoneNumber}`);
                  phoneFound = true;
                  break;
                }
              }
            } catch (error) {
              continue;
            }
          }
          
          if (!phoneFound) {
            console.warn(`⚠️ Could not find phone number for "${patientName}". It may not be listed.`);
          }
          
        } catch (error) {
          console.warn(`⚠️ Error extracting phone number for "${patientName}":`, error);
        }

        // Store the extracted data
        appointmentsData.push({
          patient: patientName,
          dateTime: `${appointmentDate} ${appointmentTime}`.trim(),
          phoneNumber: phoneNumber,
        });

        // Close the sidebar by clicking the "Agenda" button to return to the calendar
        console.log('Returning to the main agenda view...');
        const agendaButtonSelector = 'div.dl-permanent-entry-label:has-text("Agenda")';
        await page.locator(agendaButtonSelector).click();

        // Wait for the sidebar to be hidden to ensure the page is ready for the next action
        await sidebar.waitFor({ state: 'hidden', timeout: 10000 });
        console.log('Sidebar closed successfully.');

      } catch (error) {
        console.error(`Error processing appointment ${i + 1} ("${patientName}"):`, error);
        // Store error information for this appointment
        appointmentsData.push({
          patient: patientName,
          dateTime: 'Error processing',
          phoneNumber: 'Error processing',
        });

        // Attempt to recover by pressing the Escape key to close any open modal/sidebar
        console.log('Attempting to recover by pressing "Escape"...');
        await page.keyboard.press('Escape');
      }

      // Add a small random delay to mimic human behavior
      await page.waitForTimeout(1000 + Math.random() * 500);
    }

    // --- 3. FINAL RESULTS & WEBHOOK ---
    console.log('\n--- Final Results ---');
   
    // Filter out appointments where the phone number was not found or had an error
    const successfulScrapes = appointmentsData.filter(
      data => data.phoneNumber && data.phoneNumber !== 'N/A' && data.phoneNumber !== 'Error processing'
    );

    console.log(`✨ Total appointments processed: ${appointmentsData.length}`);
    console.log(`✅ Found ${successfulScrapes.length} appointments with valid phone numbers.`);

    if (successfulScrapes.length > 0) {
      console.log('Displaying successfully scraped appointments:');
      console.table(successfulScrapes);

      // --- Send Webhook ---
      console.log('\n--- Sending Webhook ---');
      const webhookUrl = 'https://robin01.app.n8n.cloud/webhook/doctolib-appointments';
      try {
        console.log(`Sending ${successfulScrapes.length} appointments to webhook...`);
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(successfulScrapes),
        });

        if (response.ok) {
          console.log('✅ Webhook sent successfully!');
        } else {
          console.error(`❌ Failed to send webhook. Status: ${response.status} ${response.statusText}`);
          const responseBody = await response.text();
          console.error('Response body:', responseBody);
        }
      } catch (error) {
        console.error('❌ An error occurred while sending the webhook:', error);
      }

    } else {
      console.log('No appointments with valid phone numbers were found in this run.');
    }

  } catch (error) {
    console.error('An unhandled error occurred during a critical part of the script:', error);
    if (page) {
        await page.screenshot({ path: 'critical_error.png' });
    }
  } finally {
    if (context) {
      await context.close();
      console.log('\n✅ Scraping complete and browser closed.');
    }
  }
}

scrapeDoctolib();
