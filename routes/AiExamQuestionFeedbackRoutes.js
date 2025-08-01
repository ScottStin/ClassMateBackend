// AI Feedback/Marking routes:

const express = require("express");
const router = express.Router();

const { OpenAI } = require('openai');
const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");

const openai = new OpenAI({
    apiKey: process.env.APIKEY
});

  /**
   * Transcribe audio
   * This functin downloads and transcribes the audio files
   * Converts the audio file into a format that the AI marking can read
   */
  async function transcribeAudioFile(audioUrl) {
    try {
      // --- Step 1: Download the audio file from the URL
      const response = await axios.get(audioUrl, { responseType: "arraybuffer" });
        
      // --- Step 2: Save the audio file locally
      const tempFilePath = path.join(__dirname, "temp-audio.wav");
      await fs.promises.writeFile(tempFilePath, response.data);

      // --- Step 3: Send the audio file to Whisper API for transcription
      const formData = new FormData();
      formData.append("file", fs.createReadStream(tempFilePath));
      formData.append("model", "whisper-1"); // Whisper model

      // console.log("Sending audio file to Whisper API...");
      //   const whisperResponse = await openai.createTranscription(formData, 'whisper-1');

      const whisperResponse = await axios.post("https://api.openai.com/v1/audio/transcriptions", formData, {
          headers: {
            "Authorization": `Bearer ${process.env.APIKEY}`,
            ...formData.getHeaders(),
          },
        });

      const transcription = whisperResponse.data.text.trim();

      // Step 4: Cleanup - Delete temporary file
      // await fs.promises.unlink(tempFilePath);
      // console.log("Transcription:", transcription);

      return transcription;
    } catch (error) {
      console.error("Error in transcribing:", error.message);
      return null; // Return null in case of failure
    }
  }

  /**
   * Convert imgage to base64
   * Converts the image url into a format that the AI marking can read
  */
  async function urlImageToBase64(imageUrl) {
    try {
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer'
      });
      const base64 = Buffer.from(response.data, 'binary').toString('base64');
      const mimeType = response.headers['content-type'];
      return `data:${mimeType};base64,${base64}`;
    } catch (error) {
      console.error('Error converting image to base64:', error);
      throw error;
    }
  }

  /**
   * This function adds media prompts to the ai prompt text:
   */
  async function addMediaPromptsToAiText(mediaPrompt) {
    let mediaPromptText = '';
  
    if (mediaPrompt?.url && mediaPrompt?.url !== '' && mediaPrompt?.type && mediaPrompt?.type !== '') {
      
      // TODO - add image prompt functionaltiy (base64 is too large too send to chat gpt, and wont accept files right now. We should use somehting like dallee to describe the image first.)
      // if(mediaPrompt?.type === 'image') {
      //   const image1 = await urlImageToBase64(mediaPrompt.url);
      //   mediaPromptText = `The student was also given the following image to accompany the written prompt: ${image1}.`
      // }

      if(mediaPrompt?.type === 'audio') {
        const audio1 = await transcribeAudioFile(mediaPrompt.url);
        mediaPromptText = `The student was also given the following audio file to accompany the written prompt (the following is a transcript of the audio file they were given): ${audio1}.`
      }
    }
    return mediaPromptText;
  }

  /**
   * This generates ai feedback for written response question:
   */
  router.post('/generate-ai-exam-feedback/written-question', async (req, res) => {
    const { text, prompt, mediaPrompt1, mediaPrompt2, mediaPrompt3 } = req.body;
      
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }
  
    // Create prompt

    const mediaPrompt1Text = await addMediaPromptsToAiText(mediaPrompt1);
    const mediaPrompt2Text = await addMediaPromptsToAiText(mediaPrompt2);
    const mediaPrompt3Text = await addMediaPromptsToAiText(mediaPrompt3);

    try {
      const aiPrompt = `
        You are an English teacher. Your student has been given the following prompt:

        ${prompt}.

        ${mediaPrompt1Text}

        ${mediaPrompt2Text}

        ${mediaPrompt3Text}

        This was the student's response:

        "${text}"

        Provide detailed feedback on the following text:
        1. Vocabulary and Spelling (vocabMark)
        2. Grammar and Punctuation (grammarMark)
        3. Content (contentMark) (i.e. how well they've understood and answered the prompt)
  
        Provide suggestions in a single paragraph with detailed explanations of rules and examples where needed. Please limit your response to approximately 500 words (though if there are few mistakes, you can use less). If there are too many errors to address in 500 words, focus on the most important ones.
    
        Finally, rate the text from 0-4 for each of the three categories (Vocabulary and Spelling, Grammar and Punctuation, Content).
  
        Please return the feedback and mark in two separate objects. For example:
  
        {
          "feedback": "Your detailed feedback here",
          "mark": {
            "vocabMark": 3,
            "grammarMark": 2,
            "contentMark": 3,
          }
        }

        For reference, you can use the following marking scheme (details below):
        0 = a1 level (beginner English level),
        1 = a2 level (lower-intermediate English level),
        2 = b1 level (intermediate English level),
        3 = b2 level (upper intermediate English level),
        4 = c1 level or above (advanced or native speaker),

        Please return whole numbers for the scores.
      `;
  
      // --- Use chat completions in the latest SDK
      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are an English teacher.' },
          { role: 'user', content: aiPrompt },
        ],
      });
  
      const response = completion.choices[0].message.content.trim();
  
      // --- Parse the response
      const result = JSON.parse(response);
  
      // --- Separate feedback and score
      const feedback = result.feedback;
      const mark = result.mark;
  
      // --- Send the response with feedback and score as separate objects
      res.json({ feedback, mark });
    } catch (error) {
      console.error('OpenAI API Error:', error);
      res.status(500).json({ error: 'Failed to process feedback. Please try again later.' });
    }
  });

  /**
   * This generates ai feedback for audio response question:
   */
  router.post("/generate-ai-exam-feedback/audio-question", async (req, res) => {
    const { audioUrl, prompt, mediaPrompt1, mediaPrompt2, mediaPrompt3 } = req.body;
  
    if (!audioUrl || !prompt) {
      return res.status(400).json({ error: "Audio link and prompt are required" });
    }

    const mediaPrompt1Text = await addMediaPromptsToAiText(mediaPrompt1);
    const mediaPrompt2Text = await addMediaPromptsToAiText(mediaPrompt2);
    const mediaPrompt3Text = await addMediaPromptsToAiText(mediaPrompt3);

    try {
      
      const studentResponseTranscription = await transcribeAudioFile(audioUrl);
  
      const aiPrompt = `
        You are an English teacher. Your student has been given the following prompt:

        ${prompt}.

        ${mediaPrompt1Text}

        ${mediaPrompt2Text}

        ${mediaPrompt3Text}

        This was the student's response:
  
        This was the student's transcribed audio response:
  
        "${studentResponseTranscription}"
  
        Provide detailed feedback on the following:
        1. Vocabulary (vocabMark)
        2. Grammar (grammarMark)
        3. Content (contentMark) (i.e., how well they've understood and answered the prompt)
        4. Fluency (fluencyMark)
        5. Pronunciation (pronunciationMark)
  
        Provide suggestions in a single paragraph with detailed explanations of rules and examples where needed. Please limit your response to approximately 500 words (though if there are few mistakes, you can use less). If there are too many errors to address in 500 words, focus on the most important ones.
  
        Finally, rate the text from 0-4 for each of the 3 categories (Vocabulary, Grammar and Content).  NOTE - because open AI currently doesn't offer fluency or pronunciation feedback for audio files, just ignore those categories for now.
  
        Return the feedback and mark in two separate objects. For example:
        {
          "feedback": "Your detailed feedback here",
          "mark": {
            "vocabMark": 3,
            "grammarMark": 2,
            "contentMark": 3,
            "fluencyMark": 4,
            "pronunciationMark": 3
          }
        }

        NOTE - because open AI currently doesn't offer fluency or pronunciation feedback for audio files, just give them both a palceholder of a score of 4 for those categories.
      `;

      const completion = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: 'You are an English teacher.' },
            { role: 'user', content: aiPrompt },
          ],
        });
    
        const aiResponse = completion.choices[0].message.content.trim();
    
        // Parse the response
        const result = JSON.parse(aiResponse);
    
        // Separate feedback and score
        const feedback = result.feedback;
        const mark = result.mark;
    
        // Send the response with feedback and score as separate objects
        res.json({ feedback, mark });

    } catch (error) {

      console.error("Error:", error.message);
      res.status(500).json({ error: "Failed to process feedback. Please try again later." });

    } finally {
      // Clean up temporary file
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
          console.log("Temporary audio file deleted.");
        }
      } catch (cleanupError) {
        console.error("Failed to delete temporary file:", cleanupError.message);
      }
    }
  });

  /**
   * This generates ai feedback for repeat sentence question:
   */
  router.post("/generate-ai-exam-feedback/repeat-sentence", async (req, res) => {
    const { audioUrl, prompt, mediaPrompt1 } = req.body;

    if (!audioUrl || !prompt) {
      return res.status(400).json({ error: "Audio link and prompt are required" });
    }

    const mediaPrompt1Text = await addMediaPromptsToAiText(mediaPrompt1);

    try {
      
      const studentResponseTranscription = await transcribeAudioFile(audioUrl);
  
      const aiPrompt = `
        You are an English teacher. Your student has been given the following prompt:

        ${prompt}.

        ${mediaPrompt1Text}

        The student is required to listen to the audio prompt and repeat it, word for word.
  
        This was the student's transcribed audio response:
  
        "${studentResponseTranscription}"
  
        Provide detailed feedback on the following:
        1. Accuracy (accuracyMark) (i.e. how closely what the student said matches the prompt. Remember that they should repeat the prompt, word for word.)
        2. Fluency (fluencyMark)
        3. Pronunciation (pronunciationMark)
  
        Provide suggestions in a single paragraph with detailed explanations of rules and examples where needed. Please limit your response to approximately 500 words (though if there are few mistakes, you can use less). If there are too many errors to address in 500 words, focus on the most important ones.
  
        Finally, rate the text from 0-4 for each of the 3 categories (Accuracy, Fluency and Pronunciation).  NOTE - because open AI currently doesn't offer fluency or pronunciation feedback for audio files, just ignore those categories for now.
  
        Return the feedback and mark in two separate objects. For example:
        {
          "feedback": "Your detailed feedback here",
          "mark": {
            "accuracyMark": 3,
            "fluencyMark": 2,
            "pronunciationMark": 3,
          }
        }

        NOTE - because open AI currently doesn't offer fluency or pronunciation feedback for audio files, just give them both a placeholder of a score of 4 for those categories.
      `;

      const completion = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: 'You are an English teacher.' },
            { role: 'user', content: aiPrompt },
          ],
        });
    
        const aiResponse = completion.choices[0].message.content.trim();
    
        // Parse the response
        const result = JSON.parse(aiResponse);
    
        // Separate feedback and score
        const feedback = result.feedback;
        const mark = result.mark;
    
        // Send the response with feedback and score as separate objects
        res.json({ feedback, mark });

    } catch (error) {

      console.error("Error:", error.message);
      res.status(500).json({ error: "Failed to process feedback. Please try again later." });

    } finally {
      // Clean up temporary file
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
          console.log("Temporary audio file deleted.");
        }
      } catch (cleanupError) {
        console.error("Failed to delete temporary file:", cleanupError.message);
      }
    }
  });

  /**
   * This generates ai feedback for read outloud question:
   */
  router.post("/generate-ai-exam-feedback/read-outloud", async (req, res) => {
    const { audioUrl, prompt } = req.body;

    if (!audioUrl || !prompt) {
      return res.status(400).json({ error: "Audio link and prompt are required" });
    }

    try {
      
      const studentResponseTranscription = await transcribeAudioFile(audioUrl);
  
      const aiPrompt = `
        You are an English teacher. Your student is required to read the given text out loud, word for word. They will be marked on pronunciation, fluency and accuracy. Here is the text they have been given to read:

        ${prompt}.
  
        This was the student's transcribed audio response:
  
        "${studentResponseTranscription}"
  
        Provide detailed feedback on the following:
        1. Accuracy (accuracyMark) (i.e. how closely what the student said matches the prompt. Remember that they should read the prompt, word for word.)
        2. Fluency (fluencyMark)
        3. Pronunciation (pronunciationMark)
  
        Provide suggestions in a single paragraph with detailed explanations of rules and examples where needed. Please limit your response to approximately 500 words (though if there are few mistakes, you can use less). If there are too many errors to address in 500 words, focus on the most important ones.
  
        Finally, rate the text from 0-4 for each of the 3 categories (Accuracy, Fluency and Pronunciation).  NOTE - because open AI currently doesn't offer fluency or pronunciation feedback for audio files, just ignore those categories for now.
  
        Return the feedback and mark in two separate objects. For example:
        {
          "feedback": "Your detailed feedback here",
          "mark": {
            "accuracyMark": 3,
            "fluencyMark": 2,
            "pronunciationMark": 3,
          }
        }

        NOTE - because open AI currently doesn't offer fluency or pronunciation feedback for audio files, just give them both a placeholder of a score of 4 for those categories.
      `;

      const completion = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: 'You are an English teacher.' },
            { role: 'user', content: aiPrompt },
          ],
        });
    
        const aiResponse = completion.choices[0].message.content.trim();
    
        // Parse the response
        const result = JSON.parse(aiResponse);
    
        // Separate feedback and score
        const feedback = result.feedback;
        const mark = result.mark;
    
        // Send the response with feedback and score as separate objects
        res.json({ feedback, mark });

    } catch (error) {

      console.error("Error:", error.message);
      res.status(500).json({ error: "Failed to process feedback. Please try again later." });

    } finally {
      // Clean up temporary file
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
          console.log("Temporary audio file deleted.");
        }
      } catch (cleanupError) {
        console.error("Failed to delete temporary file:", cleanupError.message);
      }
    }
  });

  /**
   * This generates ai feedback for multi choice:
   */
  router.post("/generate-ai-exam-feedback/multi-choice", async (req, res) => {
    const { text, prompt, multiChoiceOptions, mediaPrompt1, mediaPrompt2, mediaPrompt3 } = req.body;

    if (!text || !prompt || !multiChoiceOptions) {
      return res.status(400).json({ error: "Text, prompt and options are required" });
    }

    const mediaPrompt1Text = await addMediaPromptsToAiText(mediaPrompt1);
    const mediaPrompt2Text = await addMediaPromptsToAiText(mediaPrompt2);
    const mediaPrompt3Text = await addMediaPromptsToAiText(mediaPrompt3);
    const hasMediaPrompts = mediaPrompt1Text || mediaPrompt2Text || mediaPrompt3Text;

    // generate prompts as string:
    const multiChoiceOptionsString = multiChoiceOptions
        .map((opt, index) => `${index + 1}) ${opt.text}`)
        .join(', ');

    const multiChoiceOptionsStringCorrectOnly = multiChoiceOptions
        .map((opt, index) => ({ index: index + 1, text: opt.text, correct: opt.correct }))
        .filter(opt => opt.correct)
        .map(opt => `${opt.index}) ${opt.text}`)
        .join(', ');

    const studentAnswer = multiChoiceOptions.filter((option) => JSON.parse(text).includes(option._id))
    const studentAnswerText = studentAnswer.map((answer) => answer.text).join(', ');

    try {
  
      const aiPrompt = `
        You are an English teacher. Your student has been given a multiple-choice question. Here is the prompt:

        ${prompt}.

        Here are the options that they were given:

        ${multiChoiceOptionsString}

        Here are the correct answer(s):

        ${multiChoiceOptionsStringCorrectOnly}
  
        Here are the student's answer(s):
  
        "${studentAnswerText}"
  
        Provide detailed feedback for the student. If they were correct, praise them and reiterate why it was correct (e.g. confirm the applicable English language rules etc.). If they were incorrect or partially correct, let them know what the correct response was and why, and consider why they may have chosen their response and explain why their response isn't correct (e.g. explain English language rules).
  
        Provide suggestions in a single paragraph with detailed explanations of rules and examples where needed. Please limit your response to approximately 300 words (though you can use less if need be).
  
        Return the feedback as an object. For example:
        {
          "feedback": "Your detailed feedback here",
        }

        ${hasMediaPrompts ? `In addition, the student was also given the following media prompts (note audios have been converted to text):

        ${mediaPrompt1Text ?? ''}
        ${mediaPrompt2Text ?? ''}
        ${mediaPrompt3Text ?? ''}` : ''}
      `;

      const completion = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: 'You are an English teacher.' },
            { role: 'user', content: aiPrompt },
          ],
        });
    
        const aiResponse = completion.choices[0].message.content.trim();
    
        if(!aiResponse) {
            return res.json({ feedback: 'Error generating ai feedback1' });
        }

        // Parse the response
        const result = JSON.parse(aiResponse);
    
        if(!result?.feedback) {
            return res.json({ feedback: 'Error generating ai feedback2' });
        }

        // Separate feedback and score
        const feedback = result.feedback;
    
        // Send the response with feedback and score as separate objects
        res.json({ feedback });

    } catch (error) {

      console.error("Error:", error.message);
      res.status(500).json({ error: "Failed to process feedback. Please try again later." });

    } 
    // finally {
    //     // Clean up temporary file
    //     try {
    //       if (fs.existsSync(tempFilePath)) {
    //         fs.unlinkSync(tempFilePath);
    //         console.log("Temporary audio file deleted.");
    //       }
    //     } catch (cleanupError) {
    //       console.error("Failed to delete temporary file:", cleanupError.message);
    //     }
    //   }
  });

  /**
   * This generates ai feedback for reorder sentence:
   */
  router.post("/generate-ai-exam-feedback/reorder-sentence", async (req, res) => {
    const { text, prompt, reorderSentenceQuestionList, mediaPrompt1, mediaPrompt2, mediaPrompt3 } = req.body;

    if (!text || !prompt || !reorderSentenceQuestionList) {
      return res.status(400).json({ error: "Text, prompt and options are required" });
    }

    const mediaPrompt1Text = await addMediaPromptsToAiText(mediaPrompt1);
    const mediaPrompt2Text = await addMediaPromptsToAiText(mediaPrompt2);
    const mediaPrompt3Text = await addMediaPromptsToAiText(mediaPrompt3);
    const hasMediaPrompts = mediaPrompt1Text || mediaPrompt2Text || mediaPrompt3Text;

    const correctOrder = reorderSentenceQuestionList.map((item, index) => `${index + 1}. ${item.text}`).join(' ');
    const studentOrder = JSON.parse(text).map((item, index) => `${index + 1}. ${item}`).join(' ');

    try {
  
      const aiPrompt = `
        You are an English teacher. Your student has been given a series of sentences/words/paragraphs and they need to put them into the correct order. Here is the prompt:

        ${prompt}.

        Here are the options that they were given, in the correct order:

        ${correctOrder}
  
        Here are the options in the order the student placed them:
  
        "${studentOrder}"
  
        Provide detailed feedback for the student. If they were correct, praise them and reiterate why it was correct (e.g. confirm the applicable English language rules etc.). If they were incorrect or partially correct, let them know what the correct response was and why, and consider why they may have chosen their response and explain why their response isn't correct (e.g. explain English language rules).
  
        Provide suggestions in a single paragraph with detailed explanations of rules and examples where needed. Please limit your response to approximately 300 words (though you can use less if need be).
  
        Return the feedback as an object. For example:
        {
          "feedback": "Your detailed feedback here",
        }

        ${hasMediaPrompts ? `In addition, the student was also given the following media prompts (note audios have been converted to text):

        ${mediaPrompt1Text ?? ''}
        ${mediaPrompt2Text ?? ''}
        ${mediaPrompt3Text ?? ''}` : ''}
      `;

      const completion = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: 'You are an English teacher.' },
            { role: 'user', content: aiPrompt },
          ],
        });
    
        const aiResponse = completion.choices[0].message.content.trim();
    
        if(!aiResponse) {
            return res.json({ feedback: 'Error generating ai feedback1' });
        }

        // Parse the response
        const result = JSON.parse(aiResponse);
    
        if(!result?.feedback) {
            return res.json({ feedback: 'Error generating ai feedback2' });
        }

        // Separate feedback and score
        const feedback = result.feedback;
    
        // Send the response with feedback and score as separate objects
        res.json({ feedback });

    } catch (error) {

      console.error("Error:", error.message);
      res.status(500).json({ error: "Failed to process feedback. Please try again later." });

    } 
    // finally {
    //     // Clean up temporary file
    //     try {
    //       if (fs.existsSync(tempFilePath)) {
    //         fs.unlinkSync(tempFilePath);
    //         console.log("Temporary audio file deleted.");
    //       }
    //     } catch (cleanupError) {
    //       console.error("Failed to delete temporary file:", cleanupError.message);
    //     }
    //   }
  });

  /**
   * This generates ai feedback for match options:
   */
  router.post("/generate-ai-exam-feedback/match-options", async (req, res) => {
    const { text, prompt, matchOptionQuestionList, mediaPrompt1, mediaPrompt2, mediaPrompt3 } = req.body;

    if (!text || !prompt || !matchOptionQuestionList) {
      return res.status(400).json({ error: "Text, prompt and options are required" });
    }


    const mediaPrompt1Text = await addMediaPromptsToAiText(mediaPrompt1);
    const mediaPrompt2Text = await addMediaPromptsToAiText(mediaPrompt2);
    const mediaPrompt3Text = await addMediaPromptsToAiText(mediaPrompt3);
    const hasMediaPrompts = mediaPrompt1Text || mediaPrompt2Text || mediaPrompt3Text;

    try {
  
      const aiPrompt = `
        You are an English teacher. Your student has been given a list of words/sentences in a left column (leftOptions) and a list of matching words/sentences on a right column (rightOptions). They were tasked with matching the rightOptions to the leftOptions.

        They were given this prompt for context: ${prompt}.

        Here are how they matched the options:

        ${text}.
  
        If the id of the leftOption matches the id of the rightOption, they got the pairing correct. If the ids do not match, however, they got the pairing incorrect.
  
        Provide detailed feedback for the student. If they were correct, praise them and reiterate why it was correct (e.g. confirm the applicable English language rules etc.). If they were incorrect or partially correct, let them know what the correct response was and why, and consider why they may have chosen their response and explain why their response isn't correct (e.g. explain English language rules).
  
        Provide suggestions in a single paragraph with detailed explanations of rules and examples where needed. Please limit your response to approximately 300 words (though you can use less if need be).
  
        Return the feedback as an object. For example:
        {
          "feedback": "Your detailed feedback here",
        }

        ${hasMediaPrompts ? `In addition, the student was also given the following media prompts (note audios have been converted to text):

        ${mediaPrompt1Text ?? ''}
        ${mediaPrompt2Text ?? ''}
        ${mediaPrompt3Text ?? ''}` : ''}
      `;

      const completion = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: 'You are an English teacher.' },
            { role: 'user', content: aiPrompt },
          ],
        });
    
        const aiResponse = completion.choices[0].message.content.trim();
    
        if(!aiResponse) {
            return res.json({ feedback: 'Error generating ai feedback1' });
        }

        // Parse the response
        const result = JSON.parse(aiResponse);
    
        if(!result?.feedback) {
            return res.json({ feedback: 'Error generating ai feedback2' });
        }

        // Separate feedback and score
        const feedback = result.feedback;
    
        // Send the response with feedback and score as separate objects
        res.json({ feedback });

    } catch (error) {

      console.error("Error:", error.message);
      res.status(500).json({ error: "Failed to process feedback. Please try again later." });

    } 
    // finally {
    //     // Clean up temporary file
    //     try {
    //       if (fs.existsSync(tempFilePath)) {
    //         fs.unlinkSync(tempFilePath);
    //         console.log("Temporary audio file deleted.");
    //       }
    //     } catch (cleanupError) {
    //       console.error("Failed to delete temporary file:", cleanupError.message);
    //     }
    //   }
  });

  /**
   * This generates ai feedback for match options:
   */
  router.post("/generate-ai-exam-feedback/fill-blanks", async (req, res) => {
    const { text, prompt, fillBlanksQuestionList, mediaPrompt1, mediaPrompt2, mediaPrompt3, caseSensitive } = req.body;

    if (!text || !prompt || !fillBlanksQuestionList) {
      return res.status(400).json({ error: "Text, prompt and blanks are required" });
    }
    
    const studentResponse = JSON.parse(text).map((group, index) => {
      const items = group.map((item, i) => `${i + 1}. ${item}`).join(', ');
      return `QUESTION#${index + 1}: ${items}`;
    }).join(' ... ');
  
    const mediaPrompt1Text = await addMediaPromptsToAiText(mediaPrompt1);
    const mediaPrompt2Text = await addMediaPromptsToAiText(mediaPrompt2);
    const mediaPrompt3Text = await addMediaPromptsToAiText(mediaPrompt3);
    const hasMediaPrompts = mediaPrompt1Text || mediaPrompt2Text || mediaPrompt3Text;

    try {
  
      const aiPrompt = `
        You are an English teacher. Your student has been given a fill-in-the-blanks. Below you have the prompt, with the blanks represented by numbered spaces (e.g. 1.__________, 2.__________ etc.). Also note that there may be more than one question here, (if so, they've been separated by QUESTION#1. ... QUESTION#2. ... etc.):

        ${fillBlanksQuestionList.map((question, index) => `QUESTION#${index + 1}: ${question.text}`)}
  
        They were given this prompt for context: ${prompt}.

        Here are the correct answer to each blank, in order (again, note that there may be more than one question here, and if so, they've been separated by QUESTION#1. ... QUESTION#2. ... etc. Also, it's possible that there's more than one acceptable answer. In this case, acceptable answers are separated by a forward slash):

        ${fillBlanksQuestionList.map((question, index) => `QUESTION#${index + 1} CORRECT ANSWERS: ${question.blanks.map((blank, index) => `${index + 1}. ${blank.text}`).join(', ')}`)}
  
        Here were the students responses, in order (again, note that there may be more than one question here, and if so, they've been separated by QUESTION#1. ... QUESTION#2. ... etc.):

        ${studentResponse}

        ${caseSensitive ? 'Note that the answers are case sensitive - the student response should be in the correct case' : ''}
  
        Provide detailed feedback for the student. If they were correct, praise them and reiterate why it was correct (e.g. confirm the applicable English language rules etc.). If they were incorrect or partially correct, let them know what the correct response was and why, and consider why they may have chosen their response and explain why their response isn't correct (e.g. explain English language rules).
  
        Provide suggestions in a single paragraph with detailed explanations of rules and examples where needed. Please limit your response to approximately 300 words (though you can use less if need be).
  
        Return the feedback as an object. For example:
        {
          "feedback": "Your detailed feedback here",
        }

        ${hasMediaPrompts ? `In addition, the student was also given the following media prompts (note audios have been converted to text):

        ${mediaPrompt1Text ?? ''}
        ${mediaPrompt2Text ?? ''}
        ${mediaPrompt3Text ?? ''}` : ''}
      `;

      const completion = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: 'You are an English teacher.' },
            { role: 'user', content: aiPrompt },
          ],
        });
    
        const aiResponse = completion.choices[0].message.content.trim();
    
        if(!aiResponse) {
            return res.json({ feedback: 'Error generating ai feedback1' });
        }

        // Parse the response
        const result = JSON.parse(aiResponse);
    
        if(!result?.feedback) {
            return res.json({ feedback: 'Error generating ai feedback2' });
        }

        // Separate feedback and score
        const feedback = result.feedback;
    
        // Send the response with feedback and score as separate objects
        console.log(feedback);
        res.json({ feedback });

    } catch (error) {

      console.error("Error:", error.message);
      res.status(500).json({ error: "Failed to process feedback. Please try again later." });

    } 
  });

module.exports = router;