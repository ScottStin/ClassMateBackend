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
                      const studentResponseMultiChoice = JSON.parse(submittedStudentResponse.response)[0];
                      const correctAnswerId = foundQuestion.multipleChoiceQuestionList.find((option) => option.correct === true)._id.toString();
                      
                      if(correctAnswerId !== studentResponseMultiChoice) {
                        submittedStudentResponse.mark = { totalMark: foundQuestion.totalPointsMin }
                      } else {
                        submittedStudentResponse.mark = { totalMark: foundQuestion.totalPointsMax }
                      }
                    }

                    // -- If student's exam is a multichoice multi  answer, applying the marking immediately:
                    if (['multiple-choice-multi'].includes(foundQuestion.type.toLowerCase()) && foundQuestion.multipleChoiceQuestionList) {
                      const studentResponsesMultiChoice = JSON.parse(submittedStudentResponse.response);
                      const correctAnswerId = foundQuestion.multipleChoiceQuestionList.filter((option) => option.correct === true).map((answer) => answer._id);
                      const correctAnswerIdStrings = correctAnswerId.map(id => id.toString());

                      // if partial marking:
                      if (submittedQuestion.partialMarking === true) {
                        let rawStudentMark = 0;
                        const rawTotalMark = correctAnswerIdStrings.length;

                        studentResponsesMultiChoice.forEach(response => {
                            if (correctAnswerIdStrings.includes(response)) {
                              rawStudentMark += 1; // for every repsonse a student got correct, they given 1 point
                            } else {
                              rawStudentMark -= 1; // for every reponse a student got incorrect, they lose a point
                            }
                        });

                        // if student got zero or less points, give them the minimum score:
                        if(rawStudentMark <= 0) {
                            submittedStudentResponse.mark = { totalMark: foundQuestion.totalPointsMin }
                        } 

                        // otherwise, give the student the correct adjusted score:
                        else {
                            submittedStudentResponse.mark = { totalMark: (foundQuestion.totalPointsMax / rawTotalMark * rawStudentMark) }
                        }
                      }
                      // if  not partial marking, student must get all questions right to score:
                      else {
                        if(studentResponsesMultiChoice.length === correctAnswerIdStrings.length && studentResponsesMultiChoice.every((ans) => correctAnswerIdStrings.includes(ans))) {
                            submittedStudentResponse.mark = { totalMark: foundQuestion.totalPointsMax } // student got all answers corret
                        } else {
                            submittedStudentResponse.mark = { totalMark: foundQuestion.totalPointsMin } // student did not get all answers correct
                        }
                      }
                    }

                    // -- If student's exam is a reorder sentence, applying the marking immediately:
                    if (['reorder-sentence'].includes(foundQuestion.type.toLowerCase()) && foundQuestion.reorderSentenceQuestionList) {
                      const correctOrder = foundQuestion.reorderSentenceQuestionList.map((option) => option.text);
                      const studentAnswerOrder = JSON.parse(submittedStudentResponse.response);

                      // if partial marking, give the user points for each array item in the correct order:
                      if (submittedQuestion.partialMarking === true) {
                        if (correctOrder.length !== studentAnswerOrder.length) {
                            throw new Error("Arrays must be of the same length.");
                        }

                        let rawStudentMark = 0;
                        const rawTotalMark = correctOrder.length;

                        for (let i = 0; i < correctOrder.length; i++) {
                            if (correctOrder[i] === studentAnswerOrder[i]) {
                            rawStudentMark++;
                            }
                        }
                        submittedStudentResponse.mark = { totalMark: (foundQuestion.totalPointsMax / rawTotalMark * rawStudentMark) }
                      }
                      // if  not partial marking, student must get all questions right to score:
                      else {
                        if(JSON.stringify(correctOrder) === JSON.stringify(studentAnswerOrder)) {
                            submittedStudentResponse.mark = { totalMark: foundQuestion.totalPointsMax } // student got all answers corret
                        } else {
                            submittedStudentResponse.mark = { totalMark: foundQuestion.totalPointsMin } // student did not get all answers correct
                        }
                      }
                    }

                    // -- If student's exam is a match option , applying the marking immediately:
                    if (['match-options'].includes(foundQuestion.type.toLowerCase()) && foundQuestion.matchOptionQuestionList) {  
                        const studentAnswers = JSON.parse(submittedStudentResponse.response);

                        // if partial marking, give the user points for each array item in the correct order:
                        if (submittedQuestion.partialMarking === true) {

                            let rawStudentMark = 0;
                            const rawTotalMark = studentAnswers.length;

                            for (const answer of studentAnswers) {
                                if (answer.leftOption.id === answer.rightOption.id) {
                                    rawStudentMark++;
                                }
                            }
                            submittedStudentResponse.mark = { totalMark: (foundQuestion.totalPointsMax / rawTotalMark * rawStudentMark) }
                        }
                        // if  not partial marking, student must get all questions right to score:
                        else {
                            if(studentAnswers.every(item => item.leftOption.id === item.rightOption.id)) {
                                submittedStudentResponse.mark = { totalMark: foundQuestion.totalPointsMax } // student got all answers corret
                            } else {
                                submittedStudentResponse.mark = { totalMark: foundQuestion.totalPointsMin } // student did not get all answers correct
                            }
                        }
                    }

                    // -- If student's exam is a fill-in-the-blanks, applying the marking immediately:
                    if (['fill-in-the-blanks'].includes(foundQuestion.type.toLowerCase()) && foundQuestion.fillBlanksQuestionList) {  
                        let studentAnswers = JSON.parse(submittedStudentResponse.response).flat();
                        let correctAnswers = foundQuestion.fillBlanksQuestionList.flatMap(item => item.blanks.map(blank => blank.text));
                        const rawTotalMark = Math.min(studentAnswers.length, correctAnswers.length);
                        
                        if(!foundQuestion.caseSensitive) {
                            studentAnswers = studentAnswers.map(ans => ans?.toLowerCase());
                            correctAnswers = correctAnswers.map(ans => ans?.toLowerCase());
                        }

                        // if partial marking, give the user points for each correct blank:
                        if (submittedQuestion.partialMarking === true) {

                            let rawStudentMark = 0;

                            for (let i = 0; i < rawTotalMark; i++) {
                            const student = studentAnswers[i];
                            const correct = correctAnswers[i];

                            if (student && correct && student.trim().toLowerCase() === correct.trim().toLowerCase()) {
                                rawStudentMark += 1;
                            }
                            }
                            submittedStudentResponse.mark = { totalMark: (foundQuestion.totalPointsMax / rawTotalMark * rawStudentMark) }
                        }
                        // if  not partial marking, student must get all questions right to score:
                        else {
                            if(studentAnswers === correctAnswers) {
                                submittedStudentResponse.mark = { totalMark: foundQuestion.totalPointsMax } // student got all answers correct
                            } else {
                                submittedStudentResponse.mark = { totalMark: foundQuestion.totalPointsMin } // student did not get all answers correct
                            }
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
