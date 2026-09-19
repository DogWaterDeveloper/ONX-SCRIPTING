const puppeteer = require('puppeteer');
const readline = require('readline');

// my stupid bot for crossposting to twinsta
// started as a 50 line script, now look at it
// TODO: refactor this mess someday (lol)

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// globals because i was lazy and never set up proper state management
let gcPage = null;  
let tsPage = null;  
let isRunning = false;
let lastBootMessage = '';
let waitingForApproval = false;
let lastProcessedMsg = ''; // prevent double-processing same message

// auth token - expires june 2025, set reminder
const GAME_URL = 'https://game-fivem-ui.onx.gg/?_e_t=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImFiZDJkMmExLTNiMzAtNDZiZi1hYWZkLWFkNWM5ZGJkMDgxNCIsImNoYXJhY3Rlcl9pZCI6MjY5NTgsInVzZXJfaWQiOiJlMWZmMzVhYS1kYzcxLTQ5YjYtOWFkZi03YjJlYzEzMDhjMmQiLCJhcHAiOiJwaG9uZSIsImlhdCI6MTc4OTQ3ODM0OSwiZXhwIjoxNzkyMDcwMzQ5fQ.Y65On2uHgsz6z7Gd1AkG8kzktHdmOzppryeEZgtAWtQ';

// selectors - these broke once when they updated the ui
// had to inspect element at 3am to fix
const gcSelectors = {
    plusBtn: '#phone-app-wrapper-conversations > div > div > div > div > div > div.MuiGrid-root.MuiGrid-direction-xs-row.css-1stq7rj > div > div:nth-child(2) > i',
    attachPhoto: '#phone-app-wrapper-conversations > div > div > div > div > div > div.MuiGrid-root.MuiGrid-direction-xs-row.css-1stq7rj > div > div:nth-child(2) > button:nth-child(1)',
    // the escaped colons are because of react's generated ids
    fileInput: '#\\:r2\\: > div > div > div:nth-child(3) > div:nth-child(2) > div:nth-child(3) > div > div > div > input',
    attachConfirm: '#\\:r2\\: > div > div > div:nth-child(3) > div:nth-child(2) > div:nth-child(3) > div > button',
    msgInput: '#phone-app-wrapper-conversations > div > div > div > div > div > div.MuiGrid-root.MuiGrid-direction-xs-row.css-1stq7rj > div > div:nth-child(2) > textarea'
};

const tsSelectors = {
    newPost: '#phone-app-wrapper-twinsta > div > div.gkx67 > div > button:nth-child(4)',
    // 8 levels of nesting. ridiculous.
    imgUrlField: '#\\:r2\\: > div > div > div:nth-child(3) > div:nth-child(2) > div:nth-child(3) > div > div:nth-child(2) > div > input',
    captionField: '#\\:r2\\: > div > div > div:nth-child(3) > div:nth-child(2) > div:nth-child(3) > div > div:nth-child(1) > textarea',
    publishBtn: '#\\:r2\\: > div > div > div:nth-child(3) > div:nth-child(2) > div:nth-child(4) > button:nth-child(2)'
};

// helper because puppeteer's waitFor is flaky with this ui
const sleep = ms => new Promise(r => setTimeout(r, ms));

const ask = q => new Promise(res => rl.question(q, res));

// cdn urls come with /transform/ which breaks uploads
// found this out after way too long debugging
const cleanUrl = u => {
    if (!u) return null;
    return u.replace('/transform/', '/').split('?')[0];
};

async function boot() {
    console.log('\n=== Twinsta Bot ===');
    console.log('my janky automation script\n');
    
    // browser 1 - group chat
    console.log('launching gc browser...');
    const b1 = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--incognito']
    });
    
    gcPage = await b1.newPage();
    await gcPage.setViewport({width: 400, height: 800});
    
    try {
        await gcPage.goto(GAME_URL, {waitUntil: 'networkidle2', timeout: 60000});
    } catch(e) {
        console.log("crap, token probably expired");
        process.exit(1);
    }
    console.log("gc loaded");
    
    // browser 2 - twinsta
    console.log('launching ts browser...');
    const b2 = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--incognito']
    });
    
    tsPage = await b2.newPage();
    await tsPage.setViewport({width: 400, height: 800});
    
    try {
        await tsPage.goto(GAME_URL, {waitUntil: 'networkidle2', timeout: 60000});
    } catch(e) {
        console.log("ts load failed");
        process.exit(1);
    }
    console.log("ts loaded");
    
    console.log('\nmanual setup:');
    console.log('1. gc browser -> your mod chat');
    console.log('2. ts browser -> twinsta, hit the + button');
    console.log('');
    
    await ask('ready? hit enter... ');
    
    // test message
    lastBootMessage = '🤖 bot active';
    await sendToGC(lastBootMessage);
    await sleep(2000);
    
    isRunning = true;
    console.log('\nlive and monitoring\n');
    
    mainLoop();
}

// scrape latest message from gc
async function getLatest() {
    try {
        return await gcPage.evaluate(() => {
            const scroller = document.querySelector('.infinite-scroll-component');
            if (!scroller) return null;
            
            const msgs = scroller.querySelectorAll(':scope > div');
            if (!msgs.length) return null;
            
            const newest = msgs[0];
            const fullText = newest.innerText || '';
            const lines = fullText.split('\n').map(l => l.trim()).filter(l => l);
            
            // parsing is annoying because metadata comes after the message
            let text = '';
            for (let i =
