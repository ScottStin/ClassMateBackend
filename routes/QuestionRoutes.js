const express = require("express");
const router = express.Router();

const questionModel = require("../models/question-model");
const examModel = require("../models/exam-model");

router.get('/', async function (req, res) {
    try {
        console.log('hit questions')
        await questionModel.find()
        .then(questions => {res.json(questions)})
        .catch(err => res.status(400).json('Error: ' + err));
    } catch (error) {
        console.error("Error getting questions:", error);
        res.status(500).send("Internal Server Error");
    }
});

router.patch('/submit-exam/:id', async function (req, res) {
    try{
        const userEmail = req.body.currentUser;
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
                console.log('subQuestions:');
                console.log(foundQuestion.subQuestions);
                for(const subQuestionId of foundQuestion.subQuestions) {
                    console.log(subQuestionId.toString())
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
                
            } else {
                const submittedQuestion = req.body.questions.find((obj) => obj['_id'] === questionId)
                const submittedStudentResponse = submittedQuestion?.studentResponse?.find((obj)=>obj.student === userEmail)
                
                if(submittedStudentResponse){
                    // Set studentResponse to an empty array if it's undefined
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
                console.log('subQuestions:');
                console.log(foundQuestion.subQuestions);
                for(const subQuestionId of foundQuestion.subQuestions) {
                    console.log(subQuestionId.toString())
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

                        console.log('foundSubQuestion')
                        console.log(foundSubQuestion)
                        await foundSubQuestion.save();
                        // } 
                    }
                }
                
            } else {
                const submittedQuestion = req.body.questions.find((obj) => obj['_id'] === questionId)
                console.log('submittedQuestion')
                console.log(submittedQuestion)
                const submittedStudentResponse = submittedQuestion?.studentResponse?.find((obj)=>obj.student === studentEmail)
                console.log('submittedStudentResponse')
                console.log(submittedStudentResponse)

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
                    console.log('foundQuestion')
                    console.log(foundQuestion)
                    await foundQuestion.save();
                    // } 
                }
            }
        }
        // if (exam.studentsCompleted.includes({email: userEmail, mark: null})) {
        //     return res.status(400).json('User has already completed this exam');
        // }
        exam.studentsCompleted.find((obj=>obj.email===studentEmail)).mark = req.body.score;
        await exam.save();
        res.status(200).json('Responses submitted successfully');
    } catch (error) {
      console.error("Error submitting responses:", error);
      res.status(500).send("Internal Server Error");
    }
  });

module.exports = router;
