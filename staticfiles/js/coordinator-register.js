function sanitizeHTML(str) {
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
}

function sanitizeInput(input) {
    return input.trim().replace(/[<>]/g, '');
}

function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

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

document.querySelectorAll('.toggle-password').forEach(button => {
    button.addEventListener('click', function(e) {
        e.preventDefault();
        const targetId = this.getAttribute('data-target');
        const input = document.getElementById(targetId);
        
        if (input.type === 'password') {
            input.type = 'text';
            this.innerHTML = `
                <svg class="eye-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                </svg>
            `;
        } else {
            input.type = 'password';
            this.innerHTML = `
                <svg class="eye-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                </svg>
            `;
        }
    });
});

function checkPasswordStrength(password) {
    let strength = 0;
    const feedback = [];
    
    if (password.length >= 8) strength++;
    else feedback.push('at least 8 characters');
    
    if (password.length >= 12) strength++;
    
    if (/[a-z]/.test(password)) strength++;
    else feedback.push('lowercase letter');
    
    if (/[A-Z]/.test(password)) strength++;
    else feedback.push('uppercase letter');
    
    if (/[0-9]/.test(password)) strength++;
    else feedback.push('number');
    
    if (/[^a-zA-Z0-9]/.test(password)) strength++;
    else feedback.push('special character');
    
    return { strength, feedback };
}

const passwordInput = document.getElementById('password');
const strengthIndicator = document.getElementById('passwordStrength');
const submitBtn = document.getElementById('submitBtn');

strengthIndicator.className = 'password-strength empty';
strengthIndicator.style.display = 'block';
strengthIndicator.textContent = 'Password must be strong';

passwordInput.addEventListener('input', function() {
    const password = this.value;
    
    if (password.length === 0) {
        strengthIndicator.className = 'password-strength empty';
        strengthIndicator.style.display = 'block';
        strengthIndicator.textContent = 'Password must be strong';
        submitBtn.disabled = false;
        return;
    }
    
    const { strength, feedback } = checkPasswordStrength(password);
    
    strengthIndicator.className = 'password-strength';
    strengthIndicator.style.display = 'block';
    
    if (strength <= 2) {
        strengthIndicator.classList.add('weak');
        strengthIndicator.textContent = `❌ Weak - Add: ${sanitizeHTML(feedback.join(', '))}`;
        submitBtn.disabled = true;
    } else if (strength <= 4) {
        strengthIndicator.classList.add('medium');
        strengthIndicator.textContent = `⚠️ Medium - Consider: ${sanitizeHTML(feedback.join(', '))}`;
        submitBtn.disabled = false;
    } else {
        strengthIndicator.classList.add('strong');
        strengthIndicator.textContent = '✅ Strong password!';
        submitBtn.disabled = false;
    }
});

document.getElementById('coordinatorRegisterForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const errorDiv = document.getElementById('errorMessage');
    const successDiv = document.getElementById('successMessage');
    
    errorDiv.textContent = '';
    successDiv.textContent = '';
    
    const name = sanitizeInput(document.getElementById('name').value);
    const surname = sanitizeInput(document.getElementById('surname').value);
    const staffNumber = sanitizeInput(document.getElementById('staff_number').value);
    const email = document.getElementById('email').value.trim().toLowerCase();
    const campus = document.getElementById('campus').value;
    const role = document.getElementById('role').value;
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm_password').value;
    
    if (!name || !surname) {
        errorDiv.textContent = 'Name and surname are required';
        return;
    }
    
    if (!validateEmail(email)) {
        errorDiv.textContent = 'Please enter a valid email address';
        return;
    }
    
    if (!staffNumber || staffNumber.length < 3) {
        errorDiv.textContent = 'Please enter a valid staff number';
        return;
    }
    
    if (!campus || !role) {
        errorDiv.textContent = 'Please select campus and role';
        return;
    }
    
    const { strength } = checkPasswordStrength(password);
    if (strength <= 2) {
        errorDiv.textContent = 'Password is too weak. Please create a stronger password.';
        return;
    }
    
    if (password !== confirmPassword) {
        errorDiv.textContent = 'Passwords do not match';
        return;
    }
    
    const formData = {
        name: name,
        surname: surname,
        staff_number: staffNumber,
        email: email,
        campus: campus,
        role: role,
        password: password
    };
    
    submitBtn.disabled = true;
    submitBtn.textContent = 'Registering...';
    
    try {
        const response = await fetch('/api/coordinator/register/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken')
            },
            body: JSON.stringify(formData)
        });
        
        const data = await response.json();
        
        if (response.ok) {
            successDiv.textContent = 'Registration successful! Redirecting to login...';
            setTimeout(() => {
                window.location.href = '/login/';
            }, 2000);
        } else {
            errorDiv.textContent = Object.values(data).flat().join(', ');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Register as Coordinator';
        }
    } catch (error) {
        errorDiv.textContent = 'An error occurred. Please try again.';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Register as Coordinator';
    }
});