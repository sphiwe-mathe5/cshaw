function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

document.addEventListener('DOMContentLoaded', () => {
    async function renderLMS() {
        const lmsContentArea = document.getElementById('lmsContentArea');
        if (!lmsContentArea) return;
        
        lmsContentArea.innerHTML = '<div class="loader" style="margin: 0 auto; display: block;"></div><p style="text-align:center;">Loading Learning Hub...</p>';

        try {
            const response = await fetch('/api/lms/topics/');
            if (!response.ok) throw new Error('Failed to load LMS data');
            const topics = await response.json();

            if (topics.length === 0) {
                lmsContentArea.innerHTML = `
                    <div class="empty-state-container" style="text-align: center; padding: 40px; color: #7f8c8d;">
                        <h3 class="empty-state-title">No Courses Yet</h3>
                        <p class="empty-state-text">Check back later for new learning modules!</p>
                    </div>
                `;
                return;
            }

            let html = '<div class="lms-topic-grid">';
            const bgColors = ['#fce7f3', '#e0f2fe', '#fef9c3', '#dcfce7', '#f3e8ff'];
            
            topics.forEach((topic, index) => {
                const bgColor = bgColors[index % bgColors.length];
                const unitCount = topic.units ? topic.units.length : 0;
                let quizCount = 0;
                let completedQuizCount = 0;
                if (topic.units) {
                    topic.units.forEach(u => { 
                        if (u.quiz) {
                            quizCount++;
                            if (u.quiz.completed) completedQuizCount++;
                        }
                    });
                }
                const isTopicCompleted = (quizCount > 0 && completedQuizCount === quizCount);

                html += `
                    <div class="lms-grid-card">
                        <div class="lms-grid-card-top" style="background-color: ${bgColor};">
                            <span class="lms-tag" style="${isTopicCompleted ? 'background: #dcfce7; color: #166534;' : ''}">${isTopicCompleted ? '✅ Completed' : 'Course'}</span>
                            <h3 class="lms-card-title">${topic.title}</h3>
                            <p class="lms-card-desc">Master the fundamentals and earn points.</p>
                            
                            <div class="lms-card-stats">
                                <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg> ${unitCount} Modules</span>
                                <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg> ${quizCount} Quizzes</span>
                            </div>
                        </div>
                        <div class="lms-grid-card-bottom">
                            <span style="font-size: 0.85rem; font-weight: 600; color: #555;">Start date: <strong>Today</strong></span>
                            <button class="lms-btn-continue" onclick="const c = this.closest('.lms-grid-card'); c.classList.toggle('open'); this.innerText = c.classList.contains('open') ? 'Close' : 'Learn';">Learn</button>
                        </div>
                        <div class="lms-units-container" style="position: relative;">
                `;
                
                if (topic.units && topic.units.length > 0) {
                    topic.units.forEach(unit => {
                        const deleteBtn = window.IS_COORDINATOR ? `<button type="button" onclick="deleteUnit(${unit.id})" style="margin-left: 10px; background:none; border:none; color:#e74c3c; cursor:pointer; font-size: 0.85rem; font-weight: 600;">🗑️ Delete Unit</button>` : '';
                        html += `
                            <div class="lms-unit">
                                <h4 style="display:flex; justify-content:space-between; align-items:center;">
                                    ${unit.title}
                                    ${deleteBtn}
                                </h4>
                                <div class="lms-unit-content">
                                    ${unit.content_text}
                                </div>
                                ${unit.quiz ? `
                                    <div class="quiz-card" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                                        <div class="quiz-info">
                                            <h5 style="margin: 0 0 5px 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                                                📝 ${unit.quiz.title}
                                                ${unit.quiz.completed ? '<span style="font-size: 0.75rem; background: #dcfce7; color: #166534; padding: 2px 8px; border-radius: 12px; font-weight: 600;">✅ Completed (' + unit.quiz.user_score + '%)</span>' : '<span style="font-size: 0.75rem; background: #f1f5f9; color: #64748b; padding: 2px 8px; border-radius: 12px; font-weight: 600;">⏳ Not Attempted</span>'}
                                            </h5>
                                            <span class="quiz-points">+${unit.quiz.points_awarded} Points</span>
                                        </div>
                                        ${unit.quiz.completed ? `
                                            <button class="btn-take-quiz" disabled style="background:#f1f5f9; color:#94a3b8; cursor:not-allowed;">Already Attempted</button>
                                        ` : `
                                            <button class="btn-take-quiz" onclick="openQuizModal(${unit.quiz.id})">Take Quiz</button>
                                        `}
                                    </div>
                                ` : ''}
                            </div>
                        `;
                    });
                } else {
                    html += '<p style="color:#7f8c8d; font-style:italic;">No units in this topic yet.</p>';
                }
                html += '</div></div>';
            });
            html += '</div>';
            lmsContentArea.innerHTML = html;
            
        } catch (err) {
            console.error("LMS Error:", err);
            lmsContentArea.innerHTML = '<p style="color:red; text-align:center;">Error loading LMS data.</p>';
        }
    }

    // Global function to open quiz modal
    window.openQuizModal = async function(quizId) {
        try {
            const res = await fetch(`/api/lms/quizzes/${quizId}/`);
            if (!res.ok) throw new Error('Failed to load quiz');
            const quiz = await res.json();
            
            document.getElementById('activeQuizId').value = quiz.id;
            document.getElementById('quizTitle').innerText = quiz.title;
            
            const qContainer = document.getElementById('quizQuestionsContainer');
            qContainer.innerHTML = '';
            
            if (quiz.questions && quiz.questions.length > 0) {
                quiz.questions.forEach((q, qIndex) => {
                    let qHtml = `
                        <div class="quiz-question">
                            <div class="quiz-question-text">${qIndex + 1}. ${q.text}</div>
                    `;
                    
                    if (q.choices) {
                        q.choices.forEach(c => {
                            qHtml += `
                                <label class="quiz-choice-label">
                                    <input type="radio" name="${q.id}" value="${c.id}" class="quiz-choice-input" required>
                                    <span class="quiz-choice-text">${c.text}</span>
                                </label>
                            `;
                        });
                    }
                    qHtml += `</div>`;
                    qContainer.innerHTML += qHtml;
                });
            } else {
                qContainer.innerHTML = '<p>No questions available for this quiz.</p>';
            }
            
            document.getElementById('quizModal').style.display = 'flex';
        } catch (err) {
            console.error(err);
            alert("Error loading quiz.");
        }
    };

    window.closeQuizModal = function() {
        document.getElementById('quizModal').style.display = 'none';
        document.getElementById('quizQuestionsContainer').innerHTML = '';
        document.getElementById('quizForm').reset();
    };

    window.closeResultModal = function() {
        document.getElementById('quizResultModal').style.display = 'none';
    };

    const quizForm = document.getElementById('quizForm');
    if (quizForm) {
        quizForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const quizId = document.getElementById('activeQuizId').value;
            const formData = new FormData(e.target);
            const answers = {};
            
            for (let [key, value] of formData.entries()) {
                if (key !== 'quiz_id') {
                    answers[key] = value;
                }
            }
            
            try {
                const res = await fetch(`/api/lms/quizzes/${quizId}/submit/`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': getCookie('csrftoken')
                    },
                    body: JSON.stringify({ answers })
                });
                
                const data = await res.json();
                if (res.ok) {
                    closeQuizModal();
                    
                    const resultModal = document.getElementById('quizResultModal');
                    const icon = document.getElementById('resultIcon');
                    const title = document.getElementById('resultTitle');
                    const score = document.getElementById('resultScore');
                    const message = document.getElementById('resultMessage');
                    const totalPoints = document.getElementById('resultTotalPoints');

                    score.innerText = `Score: ${data.score}%`;
                    totalPoints.innerText = data.total_user_points;

                    if (data.passed) {
                        icon.innerText = '🏆';
                        title.innerText = 'Quiz Passed!';
                        title.style.color = '#16a34a';
                        message.innerText = `Great job! You earned ${data.points_earned} points for mastering this material.`;
                    } else {
                        icon.innerText = '💪';
                        title.innerText = 'Keep Learning!';
                        title.style.color = '#eab308';
                        message.innerText = `You didn't pass this time (70% required). Don't give up, you'll get the next one!`;
                    }

                    resultModal.style.display = 'flex';
                    renderLMS();
                } else {
                    alert(data.error || "Failed to submit quiz.");
                }
            } catch (err) {
                console.error(err);
                alert("An error occurred submitting the quiz.");
            }
        });
    }

    // Initial render
    renderLMS();

    // ==========================================
    // ADMIN / COORDINATOR LOGIC
    // ==========================================

    let quill = null;
    if (document.getElementById('editor-container')) {
        quill = new Quill('#editor-container', {
            theme: 'snow',
            placeholder: 'Write the content for this unit...',
            modules: {
                toolbar: [
                    [{ 'header': [1, 2, 3, false] }],
                    ['bold', 'italic', 'underline'],
                    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                    ['link', 'video'],
                    ['clean']
                ]
            }
        });
    }

    window.deleteUnit = async function(unitId) {
        if (!confirm("Are you sure you want to delete this unit? This cannot be undone.")) return;
        try {
            const res = await fetch(`/api/lms/units/${unitId}/`, {
                method: 'DELETE',
                headers: {
                    'X-CSRFToken': getCookie('csrftoken')
                }
            });
            if (res.ok) {
                alert("Unit deleted successfully.");
                renderLMS();
            } else {
                alert("Failed to delete unit.");
            }
        } catch (err) {
            console.error(err);
            alert("An error occurred.");
        }
    };

    let adminQuestionCount = 0;

    window.openAdminModal = function() {
        document.getElementById('adminUploadModal').style.display = 'flex';
        // Ensure at least 1 question is present
        if (adminQuestionCount === 0) {
            addAdminQuestion();
        }
    };

    window.closeAdminModal = function() {
        document.getElementById('adminUploadModal').style.display = 'none';
        const form = document.getElementById('adminUploadForm');
        if (form) {
            form.reset();
            document.getElementById('adminQuestionsContainer').innerHTML = '';
            adminQuestionCount = 0;
            if (quill) {
                quill.setContents([]);
            }
        }
    };

    window.addAdminQuestion = function() {
        adminQuestionCount++;
        const qId = adminQuestionCount;
        
        const qHtml = `
            <div class="admin-question-block" id="adminQ_${qId}">
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                    <label>Question ${qId}</label>
                    <button type="button" onclick="this.closest('.admin-question-block').remove()" style="background:none; border:none; color:#e74c3c; cursor:pointer;">Remove</button>
                </div>
                <input type="text" class="admin-q-text" data-qid="${qId}" placeholder="Enter question text here..." required>
                
                <div class="admin-choices-container" id="adminChoices_${qId}" style="margin-top: 15px;">
                    <label style="font-size: 0.85rem;">Choices (Select the correct one)</label>
                    <!-- Default 2 choices -->
                </div>
                <button type="button" onclick="addAdminChoice(${qId})" style="margin-top: 10px; background:none; border:none; color:var(--primary-orange); cursor:pointer; font-size: 0.85rem; font-weight: bold;">+ Add Choice</button>
            </div>
        `;
        
        document.getElementById('adminQuestionsContainer').insertAdjacentHTML('beforeend', qHtml);
        
        // Add 2 initial choices
        addAdminChoice(qId);
        addAdminChoice(qId);
        // Select the first one as correct by default
        const firstRadio = document.querySelector(`#adminChoices_${qId} input[type="radio"]`);
        if (firstRadio) firstRadio.checked = true;
    };

    window.addAdminChoice = function(qId) {
        const container = document.getElementById(`adminChoices_${qId}`);
        const cHtml = `
            <div class="admin-choice-block">
                <input type="radio" name="correct_q${qId}" required>
                <input type="text" class="admin-c-text" placeholder="Choice text..." required>
                <button type="button" onclick="this.parentElement.remove()" style="background:none; border:none; color:#e74c3c; cursor:pointer; font-size: 1.2rem; line-height: 1;">&times;</button>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', cHtml);
    };

    const adminForm = document.getElementById('adminUploadForm');
    if (adminForm) {
        adminForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // Build the JSON structure for questions
            const questions = [];
            const qBlocks = document.querySelectorAll('.admin-question-block');
            
            qBlocks.forEach(block => {
                const qInput = block.querySelector('.admin-q-text');
                const qText = qInput.value.trim();
                if (!qText) return;
                
                const choices = [];
                const cBlocks = block.querySelectorAll('.admin-choice-block');
                
                cBlocks.forEach(cBlock => {
                    const cText = cBlock.querySelector('.admin-c-text').value.trim();
                    const isCorrect = cBlock.querySelector('input[type="radio"]').checked;
                    if (cText) {
                        choices.push({ text: cText, is_correct: isCorrect });
                    }
                });
                
                if (choices.length > 0) {
                    questions.push({ text: qText, choices: choices });
                }
            });
            
            if (questions.length === 0) {
                alert("Please add at least one question with valid choices.");
                return;
            }

            if (quill) {
                const contentHtml = quill.root.innerHTML;
                if (contentHtml === '<p><br></p>') {
                    alert("Please write some content for the unit.");
                    return;
                }
                document.getElementById('hidden_content_text').value = contentHtml;
            }

            const formData = new FormData(adminForm);
            // Append questions as JSON string
            formData.append('questions', JSON.stringify(questions));
            
            const btn = document.getElementById('adminSubmitBtn');
            const originalText = btn.innerText;
            btn.innerText = 'Publishing...';
            btn.disabled = true;
            
            try {
                const res = await fetch('/api/lms/admin/upload-nested/', {
                    method: 'POST',
                    headers: {
                        'X-CSRFToken': getCookie('csrftoken')
                    },
                    body: formData // sending as multipart to handle file
                });
                
                const data = await res.json();
                
                if (res.ok) {
                    alert("Course successfully published!");
                    closeAdminModal();
                    renderLMS(); // refresh content
                } else {
                    alert(data.error || "Failed to publish course.");
                }
            } catch (err) {
                console.error(err);
                alert("An error occurred while publishing.");
            } finally {
                btn.innerText = originalText;
                btn.disabled = false;
            }
        });
    }
});
