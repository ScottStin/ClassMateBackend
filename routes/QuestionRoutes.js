const express = require("express");
const router = express.Router();
const { cloudinary, storage } = require('../cloudinary');

const questionModel = require("../models/question-model");
const examModel = require("../models/exam-model");
const userModel = require("../models/user-models");
const { OpenAI } = require('openai');

const openai = new OpenAI({
    apiKey: process.env.APIKEY
});

/**
 * Get all exam questions
 */
router.get('/', async function (req, res) {
    try {
        await questionModel.find()
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
        const userEmail = req.body.currentUser; // TODO - replace email with ID
        const exam = await examModel.findById(req.params.id);
        const currentStudent = await userModel.findOne({email:userEmail})

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
                    const submittedSubQuestionStudentResponse = submittedSubQuestion?.studentResponse?.find((obj)=>obj.student === userEmail)
    
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
                const submittedStudentResponse = submittedQuestion?.studentResponse?.find((obj)=>obj.student === userEmail)
                
                if(submittedStudentResponse){
                    // -- If student response is an audio file, upload to cloudinary:
                    if (foundQuestion.type.toLowerCase() === 'audio-response') {
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
        if (exam.studentsCompleted.includes({email: userEmail, mark: null})) {
            return res.status(400).json('User has already completed this exam');
          }
          exam.studentsCompleted.push({email: userEmail, mark: null});
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
        const teacherEmail = req.body.currentUser;
        const studentEmail = req.body.student;
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
                    const submittedSubQuestionStudentResponse = submittedSubQuestion?.studentResponse?.find((obj)=>obj.student === studentEmail)
    
                    if(submittedSubQuestionStudentResponse){

                        // Set studentResponse to an empty array if it's undefined
                        if(foundSubQuestion.studentResponse === undefined || foundSubQuestion.studentResponse === null) {
                            foundSubQuestion.studentResponse = [];
                            await foundSubQuestion.save();
                        } 

                        // if the student hasn't answered the question, add an object in the student response array to represent them:
                        if(!foundSubQuestion.studentResponse.find((obj)=>obj.student === studentEmail)) {
                            foundSubQuestion.studentResponse.push({student:studentEmail, response: null, mark: null, feedback: null})
                        }

                        if(foundSubQuestion.studentResponse.find((obj)=>obj.student === studentEmail)?.mark !== undefined) {
                            foundSubQuestion.studentResponse.find((obj)=>obj.student === studentEmail).mark = submittedSubQuestionStudentResponse.mark ?? null;
                        }
                        if(foundSubQuestion.studentResponse.find((obj)=>obj.student === studentEmail)?.feedback !== undefined) {
                            foundSubQuestion.studentResponse.find((obj)=>obj.student === studentEmail).feedback = submittedSubQuestionStudentResponse.feedback ?? null;
                        }
                        await foundSubQuestion.save();
                        // } 
                    }
                }
                
            } else {
                const submittedQuestion = req.body.questions.find((obj) => obj['_id'] === questionId)
                const submittedStudentResponse = submittedQuestion?.studentResponse?.find((obj)=>obj.student === studentEmail)

                if(submittedStudentResponse){
                    // Set studentResponse to an empty array if it's undefined
                    if(foundQuestion.studentResponse === undefined || foundQuestion.studentResponse === null) {
                        foundQuestion.studentResponse = [];
                        await foundQuestion.save();
                    } 

                    // if the student hasn't answered the question, add an object in the student response array to represent them:
                    if(!foundQuestion.studentResponse.find((obj)=>obj.student === studentEmail)) {
                        foundQuestion.studentResponse.push({student:studentEmail, response: null, mark: null, feedback: null})
                    }

                    if(foundQuestion.studentResponse.find((obj)=>obj.student === studentEmail)?.mark !== undefined) {
                        foundQuestion.studentResponse.find((obj)=>obj.student === studentEmail).mark = submittedStudentResponse.mark ?? null;
                    }
                    if(foundQuestion.studentResponse.find((obj)=>obj.student === studentEmail)?.feedback !== undefined) {
                        foundQuestion.studentResponse.find((obj)=>obj.student === studentEmail).feedback = submittedStudentResponse.feedback ?? null;
                    }
                    // foundQuestion.studentResponse.find((obj)=>obj.student === studentEmail)?.mark =  submittedStudentResponse.mark ?? null;
                    // foundQuestion.studentResponse.find((obj)=>obj.student === studentEmail)?.feedback =  submittedStudentResponse.feedback ?? null;
                    await foundQuestion.save();
                    // } 
                }
            }
        }
        // if (exam.studentsCompleted.includes({email: userEmail, mark: null})) {
        //     return res.status(400).json('User has already completed this exam');
        // }

        if(req.body.score) {
            exam.studentsCompleted.find((obj=>obj.email===studentEmail)).mark = req.body.score;
        } 

        if(req.body.aiMarkingComplete && !exam.aiMarkingComplete?.map((student) => student.email).includes(studentEmail)) {
            exam.aiMarkingComplete = exam.aiMarkingComplete ?? {}; // todo = remove
            exam.aiMarkingComplete.push({email:studentEmail});
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

  router.post('/generate-ai-exam-feedback/written-question', async (req, res) => {
    const { text, prompt } = req.body;
  
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }
  
    try {
      const aiPrompt = `
        You are an English teacher. Your student has been given the following prompt:

        ${prompt}.

        This was their response:

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
  
      // Use chat completions in the latest SDK
      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are an English teacher.' },
          { role: 'user', content: aiPrompt },
        ],
      });
  
      const response = completion.choices[0].message.content.trim();
  
      // Parse the response
      const result = JSON.parse(response);
  
      // Separate feedback and score
      const feedback = result.feedback;
      const mark = result.mark;
  
      // Send the response with feedback and score as separate objects
      res.json({ feedback, mark });
    } catch (error) {
      console.error('OpenAI API Error:', error);
      res.status(500).json({ error: 'Failed to process feedback. Please try again later.' });
    }
  });

module.exports = router;
