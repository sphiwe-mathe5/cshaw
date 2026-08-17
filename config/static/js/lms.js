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

function getCsrfToken() {
    const inputToken = document.querySelector('[name=csrfmiddlewaretoken]');
    if (inputToken && inputToken.value) {
        return inputToken.value;
    }
    return getCookie('csrftoken') || getCookie('__Host-csrftoken') || '';
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
                                ${unit.quiz ? (() => {
                                    const totalQ = unit.quiz.total_questions || Math.max(1, Math.round(unit.quiz.points_awarded / 2));
                                    const correct = (unit.quiz.correct_count !== null && unit.quiz.correct_count !== undefined)
                                        ? unit.quiz.correct_count 
                                        : (unit.quiz.user_score !== null ? Math.round((unit.quiz.user_score / 100) * totalQ) : 0);
                                    const incorrect = (unit.quiz.incorrect_count !== null && unit.quiz.incorrect_count !== undefined)
                                        ? unit.quiz.incorrect_count 
                                        : Math.max(0, totalQ - correct);

                                    let statusBadge = '';
                                    let pointsText = '';

                                    if (unit.quiz.completed) {
                                        const earned = (unit.quiz.user_points !== null && unit.quiz.user_points !== undefined && unit.quiz.user_points > 0)
                                            ? unit.quiz.user_points 
                                            : (correct * 2);

                                        if (unit.quiz.user_passed) {
                                            statusBadge = `<span style="font-size: 0.75rem; background: #dcfce7; color: #166534; padding: 2px 8px; border-radius: 12px; font-weight: 700;">✅ Passed (${unit.quiz.user_score}%)</span>`;
                                            pointsText = `<span class="quiz-points" style="color: #166534; font-weight: 700; background: #dcfce7; padding: 3px 10px; border-radius: 20px; font-size: 0.85rem;">+${earned} Points Earned (${correct} Correct · ${incorrect} Incorrect · Pass mark: 70%)</span>`;
                                        } else {
                                            statusBadge = `<span style="font-size: 0.75rem; background: #fee2e2; color: #991b1b; padding: 2px 8px; border-radius: 12px; font-weight: 700;">❌ Failed (${unit.quiz.user_score}%)</span>`;
                                            pointsText = `<span class="quiz-points" style="color: #b91c1c; font-weight: 700; background: #fff1f2; padding: 3px 10px; border-radius: 20px; font-size: 0.85rem;">+${earned} / ${unit.quiz.points_awarded} Points Earned (${correct} Correct · ${incorrect} Incorrect · Pass mark: 70%)</span>`;
                                        }
                                    } else {
                                        statusBadge = `<span style="font-size: 0.75rem; background: #f1f5f9; color: #64748b; padding: 2px 8px; border-radius: 12px; font-weight: 600;">⏳ Not Attempted</span>`;
                                        pointsText = `<span class="quiz-points" style="color: var(--primary-orange); font-weight: 700; background: #fff4ec; padding: 3px 10px; border-radius: 20px; font-size: 0.85rem;">+${unit.quiz.points_awarded} Points Available (${totalQ} Questions · 2 pts each · Pass mark: 70%)</span>`;
                                    }

                                    return `
                                    <div class="quiz-card" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                                        <div class="quiz-info">
                                            <h5 style="margin: 0 0 5px 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                                                📝 ${unit.quiz.title}
                                                ${statusBadge}
                                            </h5>
                                            ${pointsText}
                                        </div>
                                        ${unit.quiz.completed ? `
                                            <button class="btn-take-quiz" disabled style="background:#f1f5f9; color:#94a3b8; cursor:not-allowed;">Already Attempted</button>
                                        ` : `
                                            <button class="btn-take-quiz" onclick="openQuizModal(${unit.quiz.id})">Take Quiz</button>
                                        `}
                                    </div>
                                    `;
                                })() : ''}
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
                        'X-CSRFToken': getCsrfToken()
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
                    const correctBadge = document.getElementById('resultCorrectBadge');
                    const incorrectBadge = document.getElementById('resultIncorrectBadge');
                    const message = document.getElementById('resultMessage');
                    const earnedPoints = document.getElementById('resultEarnedPoints');
                    const pointsRate = document.getElementById('resultPointsRate');
                    const totalPoints = document.getElementById('resultTotalPoints');

                    const incorrectCount = data.incorrect_count !== undefined 
                        ? data.incorrect_count 
                        : Math.max(0, data.total_questions - data.correct_count);

                    score.innerText = `Score: ${data.score}% (Pass mark: 70%)`;
                    if (correctBadge) correctBadge.innerText = `✅ ${data.correct_count} Correct`;
                    if (incorrectBadge) incorrectBadge.innerText = `❌ ${incorrectCount} Incorrect`;
                    totalPoints.innerText = data.total_user_points;

                    if (data.passed) {
                        icon.innerText = '🏆';
                        title.innerText = 'Quiz Passed!';
                        title.style.color = '#16a34a';
                        message.innerText = `Outstanding! You answered ${data.correct_count} of ${data.total_questions} questions correctly, met the 70% pass mark, and earned +${data.points_earned} points.`;
                        earnedPoints.innerText = `+${data.points_earned} Pts`;
                        earnedPoints.style.color = '#16a34a';
                        pointsRate.innerText = `${data.total_questions} questions · 2 pts each`;
                    } else {
                        icon.innerText = '💪';
                        title.innerText = 'Good Effort!';
                        title.style.color = '#dc2626';
                        message.innerText = `You earned +${data.points_earned} points (${data.correct_count} of ${data.total_questions} questions correct). The pass mark is 70%. Don't give up — keep studying the course materials and aim higher on your next quizzes!`;
                        earnedPoints.innerText = `+${data.points_earned} Pts`;
                        earnedPoints.style.color = '#dc2626';
                        pointsRate.innerText = `${data.correct_count} correct · 2 pts each`;
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
                    'X-CSRFToken': getCsrfToken()
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
});
