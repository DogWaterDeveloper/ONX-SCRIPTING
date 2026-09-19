const puppeteer = require('puppeteer');
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

let staffBrowser = null;
let staffPage = null;
let customerBrowser = null;
let customerPage = null;
let isReady = false;
let isProcessing = false;

const sentAppointments = new Set();

try {
    if (fs.existsSync('sent-appointments.json')) {
        const saved = JSON.parse(fs.readFileSync('sent-appointments.json'));
        saved.forEach(id => sentAppointments.add(id));
        console.log('Loaded ' + saved.length + ' previously sent appointments');
    }
} catch (e) {}

async function initBrowsers() {
    console.log('Starting both bots...');
    
    staffBrowser = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--single-process'],
        userDataDir: 'C:\\staff-profile'
    });
    staffPage = await staffBrowser.newPage();
    await staffPage.setViewport({ width: 400, height: 800 });
    await staffPage.goto('https://game-fivem-ui.onx.gg/?_e_t=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImFiZDJkMmExLTNiMzAtNDZiZi1hYWZkLWFkNWM5ZGJkMDgxNCIsImNoYXJhY3Rlcl9pZCI6MjY5NTgsInVzZXJfaWQiOiJlMWZmMzVhYS1kYzcxLTQ5YjYtOWFkZi03YjJlYzEzMDhjMmQiLCJhcHAiOiJwaG9uZSIsImlhdCI6MTc4OTQ3ODM0OSwiZXhwIjoxNzkyMDcwMzQ5fQ.Y65On2uHgsz6z7Gd1AkG8kzktHdmOzppryeEZgtAWtQ', { 
        waitUntil: 'networkidle2',
        timeout: 60000 
    });
    console.log('Staff bot loaded!');
    
    customerBrowser = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--single-process'],
        userDataDir: 'C:\\customer-profile'
    });
    customerPage = await customerBrowser.newPage();
    await customerPage.setViewport({ width: 400, height: 800 });
    await customerPage.goto('https://game-fivem-ui.onx.gg/?_e_t=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImFiZDJkMmExLTNiMzAtNDZiZi1hYWZkLWFkNWM5ZGJkMDgxNCIsImNoYXJhY3Rlcl9pZCI6MjY5NTgsInVzZXJfaWQiOiJlMWZmMzVhYS1kYzcxLTQ5YjYtOWFkZi03YjJlYzEzMDhjMmQiLCJhcHAiOiJwaG9uZSIsImlhdCI6MTc4OTQ3ODM0OSwiZXhwIjoxNzkyMDcwMzQ5fQ.Y65On2uHgsz6z7Gd1AkG8kzktHdmOzppryeEZgtAWtQ', { 
        waitUntil: 'networkidle2',
        timeout: 60000 
    });
    console.log('Customer bot loaded!');
    
    await new Promise(r => setTimeout(r, 5000));
    isReady = true;
    console.log('Both bots ready!');
}

function getAppointmentTimestamp(appointmentTime) {
    if (!appointmentTime) return 'N/A';
    const date = new Date(appointmentTime);
    const unix = Math.floor(date.getTime() / 1000);
    return '<t:' + unix + ':R>';
}

// NEW: Combine separate date/time fields into single datetime
function combineDateTime(data) {
    // If already has appointment_time, use it (backward compatibility)
    if (data.appointment_time) {
        return data.appointment_time;
    }
    
    // Combine new separate fields
    if (data.appointment_date && data.appointment_hour && data.appointment_minute) {
        return `${data.appointment_date}T${data.appointment_hour}:${data.appointment_minute}:00`;
    }
    
    return null;
}

app.post('/send-notification', async (req, res) => {
    if (!isReady) {
        return res.status(503).json({ error: 'Bots not ready' });
    }
    
    if (isProcessing) {
        console.log('ERROR: Already processing, stopping');
        return res.status(429).json({ error: 'Already processing' });
    }
    
    const data = req.body.data;
    const appointmentId = req.body.id;
    
    if (sentAppointments.has(appointmentId)) {
        console.log('Appointment ' + appointmentId + ' already sent, skipping');
        return res.json({ success: true, skipped: true });
    }
    
    sentAppointments.add(appointmentId);
    try {
        fs.writeFileSync('sent-appointments.json', JSON.stringify([...sentAppointments]));
    } catch (e) {}
    
    isProcessing = true;
    console.log('=== STARTING APPOINTMENT ===');
    console.log('Appointment ID: ' + appointmentId);
    console.log('Customer: ' + data.name);
    console.log('Car: ' + data.car_interest);
    
    // NEW: Combine date + time fields
    data.appointment_time = combineDateTime(data);
    
    const apptTimestamp = getAppointmentTimestamp(data.appointment_time);
    
    try {
        // ===== BOT 1: Staff Notification =====
        console.log('STEP 1: Staff notification...');
        
        const staffLines = [
            '🚨 NEW APPOINTMENT 🚨',
            'Name: ' + (data.name || 'N/A'),
            'State ID: ' + (data.state_id || 'N/A'),
            'Phone: ' + (data.phone || 'N/A'),
            'Car: ' + (data.car_interest || 'N/A'),
            'Financing: ' + (data.financing || 'N/A'),
            'Appointment: ' + apptTimestamp,
            'Notes: ' + (data.notes || 'None')
        ];

        const staffInputs = await staffPage.$$('input[type="text"], textarea, [contenteditable="true"]');
        if (staffInputs.length === 0) {
            throw new Error('Staff: No input found');
        }
        
        const input = staffInputs[staffInputs.length - 1];
        await input.click();
        await new Promise(r => setTimeout(r, 500));
        
        for (let i = 0; i < staffLines.length; i++) {
            await input.type(staffLines[i], { delay: 5 });
            if (i < staffLines.length - 1) {
                await staffPage.keyboard.down('Shift');
                await staffPage.keyboard.press('Enter');
                await staffPage.keyboard.up('Shift');
                await new Promise(r => setTimeout(r, 100));
            }
        }
        
        await new Promise(r => setTimeout(r, 500));
        await staffPage.keyboard.press('Enter');
        console.log('STEP 1: SUCCESS');

        // ===== BOT 2: Customer Confirmation =====
        console.log('STEP 2: Customer confirmation...');
        
        const customerMessage = 'Congratulations ' + data.name + '!!\n\nIve gone ahead and notified our staff team of your requested appointment ' + apptTimestamp + ' to view ' + data.car_interest + '\n\nThank you again for choosing Black Label Autos to get you into your next dream car.';
        
        const disclaimerMessage = 'Please Note: This automated messaging system is not checked by a human. If you have any questions or need to reschedule please reach out to a member of our team.';

        // Step 2a: Click +
        console.log('STEP 2a: Clicking +...');
        try {
            await customerPage.waitForSelector('#phone-app-wrapper-conversations > div > div > div > div > div > div.IM2l8 > div:nth-child(4) > button > i', { timeout: 3000 });
            await customerPage.click('#phone-app-wrapper-conversations > div > div > div > div > div > div.IM2l8 > div:nth-child(4) > button > i');
        } catch (e) {
            console.log('Trying fallback + selector...');
            await customerPage.click('button:has(.fa-plus), [class*="plus"]');
        }
        await new Promise(r => setTimeout(r, 1500));
        console.log('STEP 2a: SUCCESS');

        // Step 2b: Click New Message
        console.log('STEP 2b: New Message...');
        await customerPage.click('#phone-app-wrapper-conversations > div > div > div > div > div > div.IM2l8 > div:nth-child(4) > div > button:nth-child(1)');
        await new Promise(r => setTimeout(r, 1500));
        console.log('STEP 2b: SUCCESS');

        // Step 2c: Enter phone
        console.log('STEP 2c: Phone number...');
        await customerPage.type('#phone-app-wrapper-conversations > div > div > div > div > div:nth-child(2) > div:nth-child(2) > div > input', data.phone, { delay: 10 });
        await new Promise(r => setTimeout(r, 1000));
        await customerPage.keyboard.press('Enter');
        await new Promise(r => setTimeout(r, 2000));
        console.log('STEP 2c: SUCCESS');

        // Step 2d: Send first message
        console.log('STEP 2d: First message...');
        await customerPage.waitForSelector('#phone-app-wrapper-conversations > div > div > div > div > div:nth-child(2) > div:nth-child(4) > textarea', { timeout: 5000 });
        await customerPage.type('#phone-app-wrapper-conversations > div > div > div > div > div:nth-child(2) > div:nth-child(4) > textarea', customerMessage, { delay: 5 });
        await new Promise(r => setTimeout(r, 500));
        await customerPage.click('#phone-app-wrapper-conversations > div > div > div > div > div:nth-child(3) > button:nth-child(2)');
        console.log('STEP 2d: SUCCESS');

        // Step 2e: Disclaimer - JUST PRESS ENTER!
        console.log('STEP 2e: Disclaimer...');
        await new Promise(r => setTimeout(r, 2000));
        await customerPage.type('#phone-app-wrapper-conversations > div > div > div > div > div > div.MuiGrid-root.MuiGrid-direction-xs-row.css-1stq7rj > div > div:nth-child(2) > textarea', disclaimerMessage, { delay: 5 });
        await new Promise(r => setTimeout(r, 500));
        await customerPage.keyboard.press('Enter'); // Just press Enter!
        console.log('STEP 2e: SUCCESS');

        // Step 2e: Contact Card
        console.log('STEP 2e: Contact card...');
        await new Promise(r => setTimeout(r, 1500));
        await customerPage.click('#phone-app-wrapper-conversations > div > div > div > div > div > div.MuiGrid-root.MuiGrid-direction-xs-row.css-1stq7rj > div > div:nth-child(2) > i');
        await new Promise(r => setTimeout(r, 1000));
        await customerPage.click('#phone-app-wrapper-conversations > div > div > div > div > div > div.MuiGrid-root.MuiGrid-direction-xs-row.css-1stq7rj > div > div:nth-child(2) > button:nth-child(4)');
        await new Promise(r => setTimeout(r, 1000));
        await customerPage.click('#\\:r2\\: > div > div > div:nth-child(3) > div:nth-child(2) > div:nth-child(4) > button:nth-child(2)');
        await new Promise(r => setTimeout(r, 500));
        console.log('STEP 2e: SUCCESS');

        // Step 2f: Go back
        console.log('STEP 2f: Going back...');
        await new Promise(r => setTimeout(r, 1000));
        await customerPage.click('[class*="back"], .fa-arrow-left');
        await new Promise(r => setTimeout(r, 1000));
        console.log('STEP 2f: SUCCESS');

        console.log('=== COMPLETE ===');
        res.json({ success: true });
        
    } catch (error) {
        console.log('=== ERROR ===');
        console.log('Failed: ' + error.message);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        isProcessing = false;
    }
});

app.get('/', (req, res) => {
    res.json({ 
        status: isReady ? 'Ready' : 'Initializing',
        processing: isProcessing,
        sentCount: sentAppointments.size,
        timestamp: new Date()
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log('Server on port ' + PORT);
    initBrowsers();
});
