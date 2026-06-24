require('dotenv').config();
const express = require('express');
const path = require('path');
const multer = require('multer');
const Groq = require('groq-sdk');

const app = express();
const PORT = process.env.PORT || 3000;

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.post('/analyze-food', upload.single('foodImage'), async function(req, res) {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                success: false,
                error: 'No image uploaded' 
            });
        }

        const imageBase64 = req.file.buffer.toString('base64');
        const mimeType = req.file.mimetype;

        console.log('Image received type:', mimeType);
        console.log('Image size:', req.file.size);

        const prompt = `You are a kidney stone prevention diet expert. Analyze this food image.
Identify all foods visible and respond with ONLY valid JSON, no other text:

{
  "foods": [
    {
      "name": "Food Name",
      "quantity": "estimated portion size",
      "oxalate": "Low",
      "oxalate_mg": 10,
      "sodium_mg": 50,
      "calcium_mg": 20,
      "protein_g": 5,
      "status": "safe",
      "reason": "explanation for kidney stone patients",
      "water_needed_ml": 200,
      "tips": "specific tip for kidney stone patients"
    }
  ],
  "total_analysis": {
    "total_oxalate_mg": 10,
    "total_sodium_mg": 50,
    "total_water_needed_ml": 200,
    "overall_status": "safe",
    "meal_risk": "Low",
    "summary": "overall meal summary for kidney stone prevention",
    "recommendation": "what to do after eating this meal"
  }
}

Rules:
- oxalate must be one of: Low, Medium, High, Very High
- status must be one of: safe, moderate, avoid
- meal_risk must be one of: Low, Medium, High
- overall_status must be one of: safe, moderate, avoid
- Focus on calcium oxalate kidney stone prevention
- Identify Indian foods specifically if present
- Return ONLY valid JSON nothing else`;

        const response = await groq.chat.completions.create({
            model: 'meta-llama/llama-4-scout-17b-16e-instruct',
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image_url',
                            image_url: {
                                url: 'data:' + mimeType + ';base64,' + imageBase64
                            }
                        },
                        {
                            type: 'text',
                            text: prompt
                        }
                    ]
                }
            ],
            temperature: 0.1,
            max_tokens: 2000
        });

        let text = response.choices[0].message.content;
        console.log('Groq response:', text);

        text = text.replace(/```json/g, '').replace(/```/g, '').trim();

        const jsonStart = text.indexOf('{');
        const jsonEnd = text.lastIndexOf('}');

        if (jsonStart === -1 || jsonEnd === -1) {
            throw new Error('No valid JSON in response');
        }

        text = text.substring(jsonStart, jsonEnd + 1);
        const analysis = JSON.parse(text);

        res.json({ success: true, analysis: analysis });

    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to analyze food image',
            details: error.message
        });
    }
});

app.get('/', function(req, res) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, function() {
    console.log('====================================');
    console.log('  KidneyCare App is Running!');
    console.log('  Open: http://localhost:' + PORT);
    console.log('====================================');
});