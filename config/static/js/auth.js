document.addEventListener('DOMContentLoaded', () => {
    
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

    const toggleLoader = (isLoading) => {
        const loader = document.getElementById('loader');
        const btn = document.getElementById('submitBtn');
        if (isLoading) {
            loader.classList.remove('hidden');
            btn.disabled = true;
        } else {
            loader.classList.add('hidden');
            btn.disabled = false;
        }
    };

    const showError = (message) => {
        const errorDiv = document.getElementById('formError');
        errorDiv.textContent = message; 
        errorDiv.classList.remove('hidden');
    };

    const clearError = () => {
        const errorDiv = document.getElementById('formError');
        errorDiv.textContent = '';
        errorDiv.classList.add('hidden');
    };

    const passwordInput = document.getElementById('password');
    const confirmInput = document.getElementById('confirm_password');
    const strengthText = document.getElementById('passwordStrength');
    const matchError = document.getElementById('passwordError');

    if (passwordInput) {
        passwordInput.addEventListener('input', () => {
            const val = passwordInput.value;
            const hasLength = val.length >= 8;
            const hasNum = /\d/.test(val);
            
            if (hasLength && hasNum) {
                strengthText.textContent = "Strong password";
                strengthText.style.color = "green";
            } else {
                strengthText.textContent = "Weak (Use 8+ chars & include a number)";
                strengthText.style.color = "red";
            }
        });
    }

    if (confirmInput) {
        confirmInput.addEventListener('input', () => {
            if (passwordInput.value !== confirmInput.value) {
                matchError.classList.remove('hidden');
            } else {
                matchError.classList.add('hidden');
            }
        });
    }

    const handleFormSubmit = async (e, url, redirectUrl) => {
        e.preventDefault();
        clearError();

        if (confirmInput && passwordInput.value !== confirmInput.value) {
            showError("Passwords do not match.");
            return;
        }

        toggleLoader(true);

        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken') 
                },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (response.ok) {
                window.location.href = redirectUrl; 
            } else {
                let msg = "An error occurred.";
                if (typeof result === 'object') {
                    const firstKey = Object.keys(result)[0];
                    const firstError = Array.isArray(result[firstKey]) ? result[firstKey][0] : result[firstKey];
                    msg = `${firstKey}: ${firstError}`;
                }
                showError(msg);
            }
        } catch (err) {
            showError("Network error. Please try again.");
            console.error(err);
        } finally {
            toggleLoader(false);
        }
    };

    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => handleFormSubmit(e, '/api/users/login/', '/')); 
    }

    const studentRegForm = document.getElementById('studentRegisterForm');
    if (studentRegForm) {
        studentRegForm.addEventListener('submit', (e) => handleFormSubmit(e, '/api/users/register/student/', '/login/'));
    }

    const coordRegForm = document.getElementById('coordinatorRegisterForm');
    if (coordRegForm) {
        coordRegForm.addEventListener('submit', (e) => handleFormSubmit(e, '/api/users/register/coordinator/', '/login/'));
    }
});

function togglePasswordVisibility(inputId, iconSpan) {
    const input = document.getElementById(inputId);
    const svg = iconSpan.querySelector('svg');
    
    if (input.type === "password") {
        input.type = "text";
        svg.style.stroke = "#333"; 
    } else {
        input.type = "password";
        svg.style.stroke = "#666";
    }
}