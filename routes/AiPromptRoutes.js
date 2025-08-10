const express = require("express");
const router = express.Router();

const { OpenAI } = require('openai');

const openai = new OpenAI({
    apiKey: process.env.APIKEY
});

router.post('/audio', async (req, res) => {

    const { prompt, gender, accent } = req.body;

    
    if (!prompt || !gender || !accent) {
      return res.status(400).json({ error: 'Missing data' });
    }

    const femaleVoices = ["alloy", "sage", "coral", "nova", "fable", "shimmer"];
    const maleVoices = ["verse", "ash", "onyx", "echo", "ballad"];
    const allVoices = [...femaleVoices, ...maleVoices];
    let selectedVoice = "alloy"

    if (gender.toLowerCase() === 'male') {
        selectedVoice = maleVoices[Math.floor(Math.random() * maleVoices.length)];
    }

    if (gender.toLowerCase() === 'female') {
        selectedVoice = femaleVoices[Math.floor(Math.random() * femaleVoices.length)];
    }

    if (gender.toLowerCase() === 'any') {
        selectedVoice = allVoices[Math.floor(Math.random() * allVoices.length)];
    }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-audio-preview",
      modalities: ["text", "audio"],
      audio: {
        voice: selectedVoice,
        format: "wav"
      },
      messages: [
        {
            role: "system",
            content: `Speak with a ${accent} accent.`
        },
        {
            role: "user",
            content: prompt
        }
      ]
    });
  
    // Get the audio Base64 from the response
    const audioData = completion.choices[0].message.audio.data; // Base64 string
    // const textResponse = completion.choices[0].message.content[0]?.text || "";

    // Convert Base64 → Buffer
    const audioBuffer = Buffer.from(audioData, "base64");

    // Send audio as binary file
    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("Content-Disposition", "inline; filename=output.wav");
    res.send(audioBuffer);

    // Return both text + audio as JSON:
    // res.json({ text: textResponse, audio: audioData });
    } catch (error) {
      console.error('OpenAI API Error:', error);
      res.status(500).json({ error: 'Failed to generate prompt. Please try again later.' });
    }
  });

router.post('/written', async (req, res) => {

    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Missing data' });
    }

    console.log(prompt);

  try {
      const completion = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'user', content: prompt },
          ],
        });

        const aiResponse = completion.choices[0].message.content.trim();
        res.json(aiResponse);
    } catch (error) {
      console.error('OpenAI API Error:', error);
      res.status(500).json({ error: 'Failed to generate prompt. Please try again later.' });
    }
  });

  module.exports = router;