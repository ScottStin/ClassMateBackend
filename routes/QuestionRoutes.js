const express = require("express");
const router = express.Router();
const { cloudinary, storage } = require('../cloudinary');

const questionModel = require("../models/question-model");
const examModel = require("../models/exam-model");
const userModel = require("../models/user-models");

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

                    // -- If student's exam is a multichoice single answer, applying the marking immediately:
                    if (['multiple-choice-single'].includes(foundQuestion.type.toLowerCase()) && foundQuestion.multipleChoiceQuestionList) {
                      const studentResponseMultiChoice = submittedStudentResponse.response
                      const correctAnswerId = foundQuestion.multipleChoiceQuestionList.find((option) => option.correct === true)._id.toString()

                      if(correctAnswerId !== studentResponseMultiChoice) {
                        submittedStudentResponse.mark = { totalMark: foundQuestion.totalPointsMin }
                      } else {
                        submittedStudentResponse.mark = { totalMark: foundQuestion.totalPointsMax }
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
                        if(!foundSubQuestion.studentResponse.find((obj)=>obj.studentId === studentId)) {
                            foundSubQuestion.studentResponse.push({studentId:studentId, response: null, mark: null, feedback: null})
                        }

                        if(foundSubQuestion.studentResponse.find((obj)=>obj.studentId === studentId)?.mark !== undefined) {
                            foundSubQuestion.studentResponse.find((obj)=>obj.studentId === studentId).mark = submittedSubQuestionStudentResponse.mark ?? null;
                        }
                        if(foundSubQuestion.studentResponse.find((obj)=>obj.studentId === studentId)?.feedback !== undefined) {
                            foundSubQuestion.studentResponse.find((obj)=>obj.studentId === studentId).feedback = submittedSubQuestionStudentResponse.feedback ?? null;
                        }
                        await foundSubQuestion.save();
                        // } 
                    }
                }
                
            } else {
                const submittedQuestion = req.body.questions.find((obj) => obj['_id'] === questionId)    
                const submittedStudentResponse = submittedQuestion?.studentResponse?.find((obj)=>obj.studentId === studentId)

                if(submittedStudentResponse){
                    // Set studentResponse to an empty array if it's undefined
                    if(foundQuestion.studentResponse === undefined || foundQuestion.studentResponse === null) {
                        foundQuestion.studentResponse = [];
                        await foundQuestion.save();
                    } 

                    // if the student hasn't answered the question, add an object in the student response array to represent them:
                    if(!foundQuestion.studentResponse.find((obj)=>obj.studentId === studentId)) {
                        foundQuestion.studentResponse.push({studentId:studentId, response: null, mark: null, feedback: null})
                    }

                    if(foundQuestion.studentResponse.find((obj)=>obj.studentId === studentId)?.mark !== undefined) {
                        foundQuestion.studentResponse.find((obj)=>obj.studentId === studentId).mark = submittedStudentResponse.mark ?? null;
                    }
                    if(foundQuestion.studentResponse.find((obj)=>obj.studentId === studentId)?.feedback !== undefined) {
                        foundQuestion.studentResponse.find((obj)=>obj.studentId === studentId).feedback = submittedStudentResponse.feedback ?? null;
                    }
                    // foundQuestion.studentResponse.find((obj)=>obj.studentId === studentId)?.mark =  submittedStudentResponse.mark ?? null;
                    // foundQuestion.studentResponse.find((obj)=>obj.studentId === studentId)?.feedback =  submittedStudentResponse.feedback ?? null;
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

module.exports = router;
