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
                    'X-CSRFToken': getValidCsrfToken() 
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
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const siteKey = loginForm.dataset.sitekey;
            const submitBtn = document.getElementById('submitBtn');
            const loader = document.getElementById('loader');

            if (!siteKey || siteKey.includes("{{")) {
                showError("System Error: Security key missing.");
                return;
            }

            submitBtn.disabled = true;
            loader.classList.remove('hidden');

            try {
                if (typeof grecaptcha === 'undefined') {
                    showError("Anti-spam script failed to load. Please refresh.");
                    submitBtn.disabled = false;
                    loader.classList.add('hidden');
                    return;
                }

                const token = await grecaptcha.execute(siteKey, { action: 'login' });

                const hiddenInput = document.getElementById('g-recaptcha-response');
                hiddenInput.value = token;

                const formData = new FormData(loginForm);

                const response = await fetch('/api/users/login/', {
                    method: 'POST',
                    headers: {
                        'X-CSRFToken': document.querySelector('[name=csrfmiddlewaretoken]').value,
                    },
                    body: formData,
                });

                const data = await response.json();

                if (!response.ok) {
                    showError(data.error || 'Login failed. Please try again.');
                    submitBtn.disabled = false;
                    loader.classList.add('hidden');
                    return;
                }

                window.location.href = '/';

            } catch (err) {
                console.error("Login error:", err);
                showError("Something went wrong. Please refresh and try again.");
                submitBtn.disabled = false;
                loader.classList.add('hidden');
            }
        });
    }

    // --- STUDENT REGISTRATION BLOCK ---
    const studentRegForm = document.getElementById('studentRegisterForm');

    if (studentRegForm) {
        studentRegForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const siteKey = studentRegForm.dataset.sitekey;
            const submitBtn = document.getElementById('submitBtn');
            const loader = document.getElementById('loader');

            console.log("=== REGISTRATION SUBMIT TRIGGERED ===");
            console.log("Site key from dataset:", siteKey);

            // --- SITE KEY CHECK ---
            if (!siteKey || siteKey.includes("{{")) {
                console.error("❌ Site key is missing or not rendered by Django.");
                showError("System Error: Security key missing.");
                return;
            }
            console.log("✅ Site key looks valid.");

            submitBtn.disabled = true;
            loader.classList.remove('hidden');

            try {
                // --- CHECK RECAPTCHA IS LOADED ---
                if (typeof grecaptcha === 'undefined') {
                    console.error("❌ grecaptcha is not defined. Script may not have loaded.");
                    showError("Anti-spam script failed to load. Please refresh.");
                    submitBtn.disabled = false;
                    loader.classList.add('hidden');
                    return;
                }
                console.log("✅ grecaptcha is available.");

                // --- EXECUTE RECAPTCHA ---
                console.log("⏳ Executing reCAPTCHA...");
                const token = await grecaptcha.execute(siteKey, { action: 'register' });
                console.log("✅ Token received:", token ? token.substring(0, 30) + "..." : "EMPTY TOKEN");

                if (!token) {
                    console.error("❌ reCAPTCHA returned an empty token.");
                    showError("Anti-spam verification returned empty. Please refresh.");
                    submitBtn.disabled = false;
                    loader.classList.add('hidden');
                    return;
                }

                // --- SET HIDDEN INPUT ---
                const hiddenInput = document.getElementById('g-recaptcha-response');
                if (!hiddenInput) {
                    console.error("❌ Hidden input #g-recaptcha-response not found in DOM.");
                    showError("System Error: Form field missing.");
                    submitBtn.disabled = false;
                    loader.classList.add('hidden');
                    return;
                }
                hiddenInput.value = token;
                console.log("✅ Token injected into hidden input.");

                // --- BUILD FORM DATA ---
                const formData = new FormData(studentRegForm);
                console.log("=== FORM DATA CONTENTS ===");
                for (let [key, value] of formData.entries()) {
                    // Mask sensitive fields in logs
                    if (key === 'password' || key === 'confirm_password') {
                        console.log(`  ${key}: [HIDDEN]`);
                    } else if (key === 'g-recaptcha-response') {
                        console.log(`  ${key}: ${value ? value.substring(0, 30) + "..." : "❌ EMPTY"}`);
                    } else {
                        console.log(`  ${key}: ${value}`);
                    }
                }

                // --- CRITICAL CHECK ---
                const tokenInForm = formData.get('g-recaptcha-response');
                if (!tokenInForm) {
                    console.error("❌ Token is missing from FormData even after setting it. This is the bug.");
                    showError("Security token error. Please refresh and try again.");
                    submitBtn.disabled = false;
                    loader.classList.add('hidden');
                    return;
                }
                console.log("✅ Token confirmed in FormData. Sending request...");

                // --- CSRF CHECK ---
                const csrfInput = document.querySelector('[name=csrfmiddlewaretoken]');
                if (!csrfInput) {
                    console.error("❌ CSRF token input not found. Check that {% csrf_token %} is in base_auth.html.");
                } else {
                    console.log("✅ CSRF token found:", csrfInput.value.substring(0, 10) + "...");
                }

                // --- SEND REQUEST ---
                const response = await fetch('/api/users/register/student/', {
                    method: 'POST',
                    headers: {
                        'X-CSRFToken': csrfInput ? csrfInput.value : '',
                    },
                    body: formData,
                });

                console.log("=== RESPONSE RECEIVED ===");
                console.log("  Status:", response.status, response.statusText);

                const data = await response.json();
                console.log("  Response body:", data);

                if (!response.ok) {
                    console.error("❌ Server rejected registration:", data);
                    
                    let errorMessage = 'Registration failed. Please try again.';
                    
                    if (data.error) {
                        // Catch our custom Python errors (like reCAPTCHA)
                        errorMessage = data.error;
                    } else if (typeof data === 'object') {
                        // Catch DRF Serializer errors and grab the very first one
                        const firstField = Object.keys(data)[0];
                        const firstError = data[firstField][0];
                        
                        // Format it nicely (e.g., "Student number: This field must be unique.")
                        const cleanFieldName = firstField.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
                        errorMessage = `${cleanFieldName}: ${firstError}`;
                    }

                    showError(errorMessage);
                    submitBtn.disabled = false;
                    loader.classList.add('hidden');
                    return;
                }

                console.log("✅ Registration successful. Redirecting...");
                window.location.href = '/login/';

            } catch (err) {
                console.error("❌ Unexpected error during registration:", err);
                showError("Something went wrong. Please refresh the page and try again.");
                submitBtn.disabled = false;
                loader.classList.add('hidden');
            }
        });

        console.log("✅ Student registration form listener attached.");
    } else {
        console.log("ℹ️ No studentRegisterForm found on this page — skipping listener.");
    }

    const coordRegForm = document.getElementById('coordinatorRegisterForm');

    if (coordRegForm) {
        coordRegForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const siteKey = coordRegForm.dataset.sitekey;
            const submitBtn = document.getElementById('submitBtn');
            const loader = document.getElementById('loader');

            if (!siteKey || siteKey.includes("{{")) {
                showError("System Error: Security key missing.");
                return;
            }

            submitBtn.disabled = true;
            loader.classList.remove('hidden');

            try {
                if (typeof grecaptcha === 'undefined') {
                    showError("Anti-spam script failed to load. Please refresh.");
                    submitBtn.disabled = false;
                    loader.classList.add('hidden');
                    return;
                }

                const token = await grecaptcha.execute(siteKey, { action: 'register' });

                const hiddenInput = document.getElementById('g-recaptcha-response');
                hiddenInput.value = token;

                const formData = new FormData(coordRegForm);

                const response = await fetch('/api/users/register/coordinator/', {
                    method: 'POST',
                    headers: {
                        'X-CSRFToken': document.querySelector('[name=csrfmiddlewaretoken]').value,
                    },
                    body: formData,
                });

                const data = await response.json();

                if (!response.ok) {
                    showError(data.error || 'Registration failed. Please try again.');
                    submitBtn.disabled = false;
                    loader.classList.add('hidden');
                    return;
                }

                window.location.href = '/login/';

            } catch (err) {
                console.error("Coordinator registration error:", err);
                showError("Something went wrong. Please refresh and try again.");
                submitBtn.disabled = false;
                loader.classList.add('hidden');
            }
        });
    }
});

const passwordResetForm = document.getElementById('passwordResetForm');

if (passwordResetForm) {
    passwordResetForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const siteKey = passwordResetForm.dataset.sitekey;
        const submitBtn = document.getElementById('submitBtn');
        const loader = document.getElementById('loader');

        if (!siteKey || siteKey.includes("{{")) {
            alert("System Error: Security key missing.");
            return;
        }

        submitBtn.disabled = true;
        loader.classList.remove('hidden');

        try {
            if (typeof grecaptcha === 'undefined') {
                alert("Anti-spam script failed to load. Please refresh.");
                submitBtn.disabled = false;
                loader.classList.add('hidden');
                return;
            }

            const token = await grecaptcha.execute(siteKey, { action: 'password_reset' });
            document.getElementById('g-recaptcha-response').value = token;

            // Submit the form normally (it's a Django form POST, not fetch)
            passwordResetForm.submit();

        } catch (err) {
            console.error("reCAPTCHA error:", err);
            alert("Something went wrong. Please refresh and try again.");
            submitBtn.disabled = false;
            loader.classList.add('hidden');
        }
    });
}

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

// --- PASSWORD RESET CONFIRM PAGE ---
const newPassword1 = document.getElementById('id_new_password1');
const newPassword2 = document.getElementById('id_new_password2');
const resetStrengthText = document.getElementById('passwordStrength');
const resetMatchError = document.getElementById('passwordError');
const resetConfirmForm = document.getElementById('passwordResetConfirmForm');

if (newPassword1) {
    newPassword1.addEventListener('input', () => {
        const val = newPassword1.value;
        const hasLength = val.length >= 8;
        const hasNum = /\d/.test(val);

        if (hasLength && hasNum) {
            resetStrengthText.textContent = "Strong password";
            resetStrengthText.style.color = "green";
        } else {
            resetStrengthText.textContent = "Weak (Use 8+ chars & include a number)";
            resetStrengthText.style.color = "red";
        }
    });
}

if (newPassword2) {
    newPassword2.addEventListener('input', () => {
        if (newPassword1.value !== newPassword2.value) {
            resetMatchError.classList.remove('hidden');
        } else {
            resetMatchError.classList.add('hidden');
        }
    });
}

if (resetConfirmForm) {
    resetConfirmForm.addEventListener('submit', (e) => {
        if (newPassword1.value !== newPassword2.value) {
            e.preventDefault();
            resetMatchError.classList.remove('hidden');
            return;
        }
        // This is a normal Django POST so no fetch needed — just let it submit
    });
}