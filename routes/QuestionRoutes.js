const express = require("express");
const router = express.Router();
const { cloudinary, storage } = require('../cloudinary');

const questionModel = require("../models/question-model");
const examModel = require("../models/exam-model");
const userModel = require("../models/user-models");
const { OpenAI } = require('openai');
const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");

const openai = new OpenAI({
    apiKey: process.env.APIKEY
});

/**
 * Get all exam questions
 */
router.get('/', async function (req, res) {
    try {
      // Extract the examId from the query parameters
      const examId = req.query.examId;

      // If examId is provided, filter questions by examId
      let filter = {};
      if (examId) {
        filter = { examId: examId };
      }

      await questionModel.find(filter)
        .then(questions => {res.json(questions)})
        .catch(err => res.status(400).json('Error: ' + err));
    } catch (error) {
        console.error("Error getting questions:", error);
        res.status(500).send("Internal Server Error");
    }
});

/**
 * Submit student's exam question responses
 */
router.patch('/submit-exam/:id', async function (req, res) {
    try{
        const studentId = req.body.currentUserId;
        const exam = await examModel.findById(req.params.id);
        const currentStudent = await userModel.findOne({_id:studentId})

        if (!exam) {
            return res.status(404).json('Exam not found');
        }
      
        for (const questionId of exam.questions) {
            const foundQuestion = await questionModel.findById(questionId);
            if(!foundQuestion){
                return res.status(404).json('Question not found');
            }

            // --- Submit a section type question:
            if(foundQuestion.type.toLowerCase() === 'section' && foundQuestion.subQuestions?.length >0){
                for(const subQuestionId of foundQuestion.subQuestions) {
                    const foundSubQuestion = await questionModel.findById(subQuestionId.toString());
                    const submittedSubQuestion = req.body.questions.find((obj) => obj['_id'] === questionId).subQuestions.find((obj) => obj['_id'] === subQuestionId.toString())
                    const submittedSubQuestionStudentResponse = submittedSubQuestion?.studentResponse?.find((obj)=>obj.studentId === studentId)
    
                    if(submittedSubQuestionStudentResponse){
                        // Set studentResponse to an empty array if it's undefined
                        if(foundSubQuestion.studentResponse === undefined || foundQuestion.studentResponse === null) {
                            foundQuestion.studentResponse = [submittedSubQuestionStudentResponse];
                            await foundSubQuestion.save();
                        } else {
                            foundSubQuestion.studentResponse.push(submittedSubQuestionStudentResponse);
                            await foundSubQuestion.save();
                        } 
                    }
                }
            } 

            // --- Submit a regular (non-section) question type:
            else {
                const submittedQuestion = req.body.questions.find((obj) => obj['_id'] === questionId)
                const submittedStudentResponse = submittedQuestion?.studentResponse?.find((obj)=>obj.studentId === studentId)
                
                if(submittedStudentResponse){
                    // -- If student response is an audio file, upload to cloudinary:
                    if (['audio-response', 'repeat-sentence', 'read-outloud'].includes(foundQuestion.type.toLowerCase())) {
                        const base64String = submittedStudentResponse.response;
                    
                        try {
                            // Upload the Base64 string to Cloudinary with the correct resource type
                            const result = await cloudinary.uploader.upload(base64String, {
                                folder: `${currentStudent.schoolId}/exam-question-responses/${exam._id}`,
                                resource_type: 'video' // Specify 'video' for audio files
                            });
                    
                            // Update the response URL
                            submittedStudentResponse.response = result.secure_url;
                            console.log(submittedStudentResponse.response);
                        } catch (err) {
                            console.error("Cloudinary upload failed:", err);
                        }
                    }

                    // -- Set studentResponse to an empty array if it's undefined, else save
                    if(foundQuestion.studentResponse === undefined || foundQuestion.studentResponse === null) {
                        foundQuestion.studentResponse = [submittedStudentResponse];
                        await foundQuestion.save();
                    } else {
                        foundQuestion.studentResponse.push(submittedStudentResponse);
                        await foundQuestion.save();
                    } 
                }
            }
        }
        if (exam.studentsCompleted.includes({studentId: studentId, mark: null})) {
            return res.status(400).json('User has already completed this exam');
          }
          exam.studentsCompleted.push({studentId: studentId, mark: null});
          await exam.save();
        res.status(200).json('Responses submitted successfully');
    } catch (error) {
      console.error("Error submitting responses:", error);
      res.status(500).send("Internal Server Error");
    }
  });

/**
 * Submit teacher's feedback for student's exam question responses
 */
router.patch('/submit-feedback/:id', async function (req, res) {
    try{
        const teacherId = req.body.currentUserId;
        const studentId = req.body.studentId;
        const exam = await examModel.findById(req.params.id);
        if (!exam) {
            return res.status(404).json('Exam not found');
        }
      
        for (const questionId of exam.questions) {
            const foundQuestion = await questionModel.findById(questionId);
            if(!foundQuestion){
                return res.status(404).json('Question not found');
            }

            if(foundQuestion.type.toLowerCase() === 'section' && foundQuestion.subQuestions?.length >0){
                for(const subQuestionId of foundQuestion.subQuestions) {
                    const foundSubQuestion = await questionModel.findById(subQuestionId.toString());
                    const submittedSubQuestion = req.body.questions.find((obj) => obj['_id'] === questionId).subQuestions.find((obj) => obj['_id'] === subQuestionId.toString())
                    const submittedSubQuestionStudentResponse = submittedSubQuestion?.studentResponse?.find((obj)=>obj.studentId === studentId)
    
                    if(submittedSubQuestionStudentResponse){

                        // Set studentResponse to an empty array if it's undefined
                        if(foundSubQuestion.studentResponse === undefined || foundSubQuestion.studentResponse === null) {
                            foundSubQuestion.studentResponse = [];
                            await foundSubQuestion.save();
                        } 

                        // if the student hasn't answered the question, add an object in the student response array to represent them:
                        if(!foundSubQuestion.studentResponse.find((obj)=>obj.student === studentId)) {
                            foundSubQuestion.studentResponse.push({student:studentId, response: null, mark: null, feedback: null})
                        }

                        if(foundSubQuestion.studentResponse.find((obj)=>obj.student === studentId)?.mark !== undefined) {
                            foundSubQuestion.studentResponse.find((obj)=>obj.student === studentId).mark = submittedSubQuestionStudentResponse.mark ?? null;
                        }
                        if(foundSubQuestion.studentResponse.find((obj)=>obj.student === studentId)?.feedback !== undefined) {
                            foundSubQuestion.studentResponse.find((obj)=>obj.student === studentId).feedback = submittedSubQuestionStudentResponse.feedback ?? null;
                        }
                        await foundSubQuestion.save();
                        // } 
                    }
                }
                
            } else {
                const submittedQuestion = req.body.questions.find((obj) => obj['_id'] === questionId)
                const submittedStudentResponse = submittedQuestion?.studentResponse?.find((obj)=>obj.student === studentId)

                if(submittedStudentResponse){
                    // Set studentResponse to an empty array if it's undefined
                    if(foundQuestion.studentResponse === undefined || foundQuestion.studentResponse === null) {
                        foundQuestion.studentResponse = [];
                        await foundQuestion.save();
                    } 

                    // if the student hasn't answered the question, add an object in the student response array to represent them:
                    if(!foundQuestion.studentResponse.find((obj)=>obj.student === studentId)) {
                        foundQuestion.studentResponse.push({student:studentId, response: null, mark: null, feedback: null})
                    }

                    if(foundQuestion.studentResponse.find((obj)=>obj.student === studentId)?.mark !== undefined) {
                        foundQuestion.studentResponse.find((obj)=>obj.student === studentId).mark = submittedStudentResponse.mark ?? null;
                    }
                    if(foundQuestion.studentResponse.find((obj)=>obj.student === studentId)?.feedback !== undefined) {
                        foundQuestion.studentResponse.find((obj)=>obj.student === studentId).feedback = submittedStudentResponse.feedback ?? null;
                    }
                    // foundQuestion.studentResponse.find((obj)=>obj.student === studentId)?.mark =  submittedStudentResponse.mark ?? null;
                    // foundQuestion.studentResponse.find((obj)=>obj.student === studentId)?.feedback =  submittedStudentResponse.feedback ?? null;
                    await foundQuestion.save();
                    // } 
                }
            }
        }
        // if (exam.studentsCompleted.includes({studentId: studentId, mark: null})) {
        //     return res.status(400).json('User has already completed this exam');
        // }

        if(req.body.score) {
            exam.studentsCompleted.find((obj=>obj.studentId===studentId)).mark = req.body.score;
        } 

        if(req.body.aiMarkingComplete && !exam.aiMarkingComplete?.map((student) => student.studentId).includes(studentId)) {
            exam.aiMarkingComplete = exam.aiMarkingComplete ?? {}; // todo = remove
            exam.aiMarkingComplete.push({studentId:studentId});
        }
        await exam.save();
        res.status(200).json('Responses submitted successfully');
    } catch (error) {
      console.error("Error submitting responses:", error);
      res.status(500).send("Internal Server Error");
    }
  });

  /**
   * ============================================
   * AI Feedback/Marking:
   * todo - move this to its own service/route
   * ============================================
   */

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

      // console.log("Audio file saved at:", tempFilePath);

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
  
        Finally, rate the text from 0-4 for each of the 3 categories (Vocabulary, Grammar and Content).  NOTE - because open AI currently doesn't offer fluency or pronuciation feedback for audio files, just ignore those categories for now.
  
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

        NOTE - because open AI currently doesn't offer fluency or pronuciation feedback for audio files, just give them both a palceholder of a score of 4 for those categories.
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
  
        Finally, rate the text from 0-4 for each of the 3 categories (Accuracy, Fluency and Pronunciation).  NOTE - because open AI currently doesn't offer fluency or pronuciation feedback for audio files, just ignore those categories for now.
  
        Return the feedback and mark in two separate objects. For example:
        {
          "feedback": "Your detailed feedback here",
          "mark": {
            "accuracyMark": 3,
            "fluencyMark": 2,
            "pronunciationMark": 3,
          }
        }

        NOTE - because open AI currently doesn't offer fluency or pronuciation feedback for audio files, just give them both a palceholder of a score of 4 for those categories.
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
  
        Finally, rate the text from 0-4 for each of the 3 categories (Accuracy, Fluency and Pronunciation).  NOTE - because open AI currently doesn't offer fluency or pronuciation feedback for audio files, just ignore those categories for now.
  
        Return the feedback and mark in two separate objects. For example:
        {
          "feedback": "Your detailed feedback here",
          "mark": {
            "accuracyMark": 3,
            "fluencyMark": 2,
            "pronunciationMark": 3,
          }
        }

        NOTE - because open AI currently doesn't offer fluency or pronuciation feedback for audio files, just give them both a palceholder of a score of 4 for those categories.
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
  

module.exports = router;
