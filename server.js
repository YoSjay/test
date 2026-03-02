require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// CONFIGURATION
// ============================================
const PORT = process.env.PORT || 3000;
const VOUCH_DB_FILE = path.join(__dirname, 'vouches.json');
const VOUCH_ADMIN_PASSWORD = 'sofmun-Gitpox-syzto1';

// OpenAI API for vouch verification
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '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';

// Staff members
const STAFF_MEMBERS = {
  'sjay': { name: 'SJay', color: '#00d9ff' },
  'nouzen': { name: 'Nouzen', color: '#ff6b6b' },
  'daedae': { name: 'DaeDae', color: '#4ecdc4' },
  'kyzo': { name: 'Kyzo', color: '#a855f7' }
};

// ============================================
// DATABASE
// ============================================
let vouchDb = { vouches: [], staff: {} };

function loadVouchDatabase() {
  try {
    if (fs.existsSync(VOUCH_DB_FILE)) {
      vouchDb = JSON.parse(fs.readFileSync(VOUCH_DB_FILE, 'utf8'));
    } else {
      // Initialize with staff members
      for (const [id, info] of Object.entries(STAFF_MEMBERS)) {
        vouchDb.staff[id] = {
          name: info.name,
          color: info.color,
          totalEarnings: 0,
          vouchCount: 0,
          vouches: []
        };
      }
      saveVouchDatabase();
    }
  } catch (error) {
    console.error('Error loading vouch database:', error);
    // Initialize fresh
    for (const [id, info] of Object.entries(STAFF_MEMBERS)) {
      vouchDb.staff[id] = {
        name: info.name,
        color: info.color,
        totalEarnings: 0,
        vouchCount: 0,
        vouches: []
      };
    }
  }
}

function saveVouchDatabase() {
  try {
    fs.writeFileSync(VOUCH_DB_FILE, JSON.stringify(vouchDb, null, 2));
  } catch (error) {
    console.error('Error saving vouch database:', error);
  }
}

loadVouchDatabase();

// ============================================
// AI VOUCH VERIFICATION
// ============================================
async function analyzeVouchWithAI(imageBase64, staffName) {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are a vouch verification assistant for SJTweaks. Analyze screenshots of customer vouches/testimonials.

PRODUCTS - Identify which product the vouch is for:
- "Controller Macro" or "SJ Macro" or "Macro Controller" = CONTROLLER MACRO ($3 commission)
- "Zero Delay" or "ZD" (not plus) = ZERO DELAY ($1)
- "Zero Delay Plus" or "ZD+" or "ZD Plus" = ZERO DELAY PLUS ($1)
- "FPS Boost" or "FPS" = FPS BOOST ($1)
- "Ping Optimizer" or "Ping" = PING OPTIMIZER ($1)
- "Premium Utility" or "Premium" or "All in One" = PREMIUM UTILITY ($1)
- "Aim Bundle" or "Aim" = AIM BUNDLE ($1)
- "Shotgun Pack" or "Shotgun" = SHOTGUN PACK ($1)
- "Keyboard Macro" = KEYBOARD MACRO ($1)

Return the EXACT product name from the list above (e.g. "Zero Delay", "Premium Utility", "Controller Macro")

STAFF NAMES TO LOOK FOR (check who helped the customer):
- "sjay" or "sj" = SJAY
- "nouzen" = NOUZEN  
- "daedae" or "dae dae" or "dae" = DAEDAE
- "kyzo" = KYZO

Look for staff names mentioned in the vouch (customer thanking them, mentioning who helped, etc.)

A valid vouch typically contains:
- Customer saying thank you, appreciation, or positive feedback
- Mention of the product working or being satisfied
- Could be a Discord message screenshot, DM, or review

Respond in JSON format ONLY:
{
  "valid": true/false,
  "isController": true/false (if the vouch mentions controller macro),
  "staffMentioned": ["name1", "name2"] (lowercase staff names found in the image),
  "productMentioned": "product name if identifiable",
  "reason": "brief explanation"
}`
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: `Analyze this vouch screenshot submitted by ${staffName}. Check if it's a valid vouch, what product it's for, and if multiple staff members are mentioned.` },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
            ]
          }
        ],
        max_tokens: 500
      })
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    return { valid: false, reason: 'Could not parse AI response' };
  } catch (error) {
    console.error('AI Analysis error:', error);
    return { valid: false, reason: 'AI analysis failed: ' + error.message };
  }
}

// ============================================
// API ROUTES
// ============================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'SJTweaks Staff Vouch System' });
});

// Submit a vouch
app.post('/api/vouches/submit', async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    
    if (!imageBase64) {
      return res.status(400).json({ success: false, error: 'No image provided' });
    }
    
    console.log(`📸 Vouch submitted, analyzing with AI...`);
    
    // Analyze with AI - it detects staff from the image
    const analysis = await analyzeVouchWithAI(imageBase64, 'unknown');
    
    console.log(`🤖 AI Analysis:`, analysis);
    
    if (!analysis.valid) {
      return res.json({ success: false, error: analysis.reason, analysis });
    }

    // Get staff from AI detection
    let staffInvolved = analysis.staffMentioned?.length > 0 
      ? analysis.staffMentioned.filter(s => STAFF_MEMBERS[s.toLowerCase()])
      : [];
    
    if (staffInvolved.length === 0) {
      return res.json({ success: false, error: 'Could not detect staff name in the vouch. Make sure the customer mentions who helped them.', analysis });
    }
    
    // Normalize staff IDs
    staffInvolved = staffInvolved.map(s => s.toLowerCase());

    // Calculate earnings
    const baseAmount = analysis.isController ? 3 : 1;
    const earningsPerPerson = baseAmount / staffInvolved.length;

    // Create vouch record
    const vouch = {
      id: crypto.randomBytes(8).toString('hex'),
      submittedBy: staffInvolved[0], // First detected staff
      staffInvolved: staffInvolved,
      product: analysis.productMentioned || 'Unknown',
      isController: analysis.isController || false,
      baseAmount,
      earningsPerPerson,
      timestamp: new Date().toISOString(),
      imageHash: crypto.createHash('md5').update(imageBase64.substring(0, 1000)).digest('hex')
    };

    // Add vouch to database
    vouchDb.vouches.push(vouch);
    
    // Update each staff member's stats
    for (const staff of staffInvolved) {
      const sid = staff.toLowerCase();
      if (!vouchDb.staff[sid]) {
        vouchDb.staff[sid] = {
          name: STAFF_MEMBERS[sid]?.name || staff,
          color: STAFF_MEMBERS[sid]?.color || '#888888',
          totalEarnings: 0,
          vouchCount: 0,
          vouches: []
        };
      }
      vouchDb.staff[sid].totalEarnings += earningsPerPerson;
      vouchDb.staff[sid].vouchCount += 1;
      vouchDb.staff[sid].vouches.push(vouch.id);
    }

    saveVouchDatabase();
    
    // Build nice message
    const staffNames = staffInvolved.map(s => STAFF_MEMBERS[s]?.name || s);
    const totalAmount = baseAmount;
    let message;
    
    if (staffInvolved.length === 1) {
      message = `$${totalAmount.toFixed(2)} has been added to ${staffNames[0]}'s earnings!`;
    } else {
      message = `$${earningsPerPerson.toFixed(2)} each has been added to ${staffNames.join(' & ')}! (split from $${totalAmount.toFixed(2)})`;
    }
    
    console.log(`✅ ${message}`);

    res.json({ 
      success: true, 
      vouch,
      analysis,
      message,
      staffCredited: staffNames,
      amountPerPerson: earningsPerPerson,
      product: analysis.productMentioned
    });
  } catch (error) {
    console.error('Submit error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get staff dashboard data
app.get('/api/vouches/staff/:staffId', (req, res) => {
  const staffId = req.params.staffId.toLowerCase();
  
  if (!STAFF_MEMBERS[staffId]) {
    return res.status(404).json({ success: false, error: 'Staff member not found' });
  }

  const staffData = vouchDb.staff[staffId] || {
    name: STAFF_MEMBERS[staffId].name,
    color: STAFF_MEMBERS[staffId].color,
    totalEarnings: 0,
    vouchCount: 0,
    vouches: []
  };

  // Get full vouch details
  const vouchDetails = staffData.vouches.map(vouchId => 
    vouchDb.vouches.find(v => v.id === vouchId)
  ).filter(Boolean).reverse();

  res.json({
    success: true,
    staff: {
      id: staffId,
      ...staffData,
      vouchDetails
    }
  });
});

// Admin: Get all staff data (requires password)
app.post('/api/vouches/admin', (req, res) => {
  const { password } = req.body;
  
  if (password !== VOUCH_ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, error: 'Invalid password' });
  }

  const allStaff = Object.entries(STAFF_MEMBERS).map(([id, info]) => {
    const data = vouchDb.staff[id] || {
      name: info.name,
      color: info.color,
      totalEarnings: 0,
      vouchCount: 0,
      vouches: []
    };
    return { id, ...data };
  });

  res.json({
    success: true,
    staff: allStaff,
    totalVouches: vouchDb.vouches.length,
    recentVouches: vouchDb.vouches.slice(-50).reverse()
  });
});

// Admin: Reset earnings (requires password)
app.post('/api/vouches/admin/reset', (req, res) => {
  const { password, staffId } = req.body;
  
  if (password !== VOUCH_ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, error: 'Invalid password' });
  }

  if (staffId && vouchDb.staff[staffId]) {
    // Remove vouches where this staff was the only person
    const vouchesToRemove = vouchDb.vouches.filter(v => 
      v.staffInvolved.includes(staffId) && v.staffInvolved.length === 1
    ).map(v => v.id);
    
    vouchDb.vouches = vouchDb.vouches.filter(v => !vouchesToRemove.includes(v.id));
    
    vouchDb.staff[staffId].totalEarnings = 0;
    vouchDb.staff[staffId].vouchCount = 0;
    vouchDb.staff[staffId].vouches = [];
    
    console.log(`🔄 Reset ${staffId}'s earnings`);
  } else {
    // Reset all
    for (const id of Object.keys(vouchDb.staff)) {
      vouchDb.staff[id].totalEarnings = 0;
      vouchDb.staff[id].vouchCount = 0;
      vouchDb.staff[id].vouches = [];
    }
    vouchDb.vouches = [];
    console.log(`🔄 Reset ALL earnings and vouches`);
  }

  saveVouchDatabase();
  res.json({ success: true, message: staffId ? `Reset ${staffId}` : 'Reset all staff' });
});

// Admin: Delete a vouch
app.post('/api/vouches/admin/delete', (req, res) => {
  const { password, vouchId } = req.body;
  
  if (password !== VOUCH_ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, error: 'Invalid password' });
  }

  const vouch = vouchDb.vouches.find(v => v.id === vouchId);
  if (!vouch) {
    return res.status(404).json({ success: false, error: 'Vouch not found' });
  }

  // Remove earnings from staff
  for (const staffId of vouch.staffInvolved) {
    if (vouchDb.staff[staffId]) {
      vouchDb.staff[staffId].totalEarnings -= vouch.earningsPerPerson;
      vouchDb.staff[staffId].vouchCount -= 1;
      vouchDb.staff[staffId].vouches = vouchDb.staff[staffId].vouches.filter(v => v !== vouchId);
      
      // Ensure no negative values
      if (vouchDb.staff[staffId].totalEarnings < 0) vouchDb.staff[staffId].totalEarnings = 0;
      if (vouchDb.staff[staffId].vouchCount < 0) vouchDb.staff[staffId].vouchCount = 0;
    }
  }

  // Remove vouch
  vouchDb.vouches = vouchDb.vouches.filter(v => v.id !== vouchId);
  saveVouchDatabase();
  
  console.log(`🗑️ Deleted vouch ${vouchId}`);

  res.json({ success: true, message: 'Vouch deleted' });
});

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log(`\n🚀 SJTweaks Staff Vouch System running on port ${PORT}`);
  console.log(`📋 Staff members: ${Object.keys(STAFF_MEMBERS).join(', ')}`);
  console.log(`📊 Total vouches: ${vouchDb.vouches.length}`);
  console.log(`🔐 Admin panel: /admin`);
});
