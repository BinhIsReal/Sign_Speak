/**
 * Auth Controller for Sign_Speak Login & Registration
 */

function togglePasswordVis() {
  const pass = document.getElementById("password");
  const icon = document.getElementById("visIcon");
  if (!pass) return;
  if (pass.type === "password") {
    pass.type = "text";
    if (icon) icon.innerText = "visibility_off";
  } else {
    pass.type = "password";
    if (icon) icon.innerText = "visibility";
  }
}

function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
}

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginAuthForm");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const emailInput = document.getElementById("email");
      const passwordInput = document.getElementById("password");
      const submitBtn = document.getElementById("submitBtn");
      const msg = document.getElementById("authMessage");

      const email = emailInput ? emailInput.value.trim() : "";
      const password = passwordInput ? passwordInput.value.trim() : "";

      if (!email || !password) {
        if (msg) {
          msg.classList.remove("hidden");
          msg.className =
            "p-3 rounded-2xl text-sm font-bold text-center bg-rose-100 text-rose-700 border border-rose-300";
          msg.innerText = "Vui lòng nhập đầy đủ Email và Mật khẩu!";
        }
        return;
      }

      if (!isValidEmail(email)) {
        if (msg) {
          msg.classList.remove("hidden");
          msg.className =
            "p-3 rounded-2xl text-sm font-bold text-center bg-rose-100 text-rose-700 border border-rose-300";
          msg.innerText =
            "Định dạng Email không hợp lệ (Ví dụ: name@company.com)!";
        }
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = "Đang xác thực tài khoản...";
      }

      const res = await window.supabaseService.signIn(email, password);

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerText = "Đăng nhập";
      }

      if (msg) msg.classList.remove("hidden");

      if (res.error) {
        if (msg) {
          msg.className =
            "p-3 rounded-2xl text-sm font-bold text-center bg-rose-100 text-rose-700 border border-rose-300";
          msg.innerText =
            res.error.message ||
            "Đăng nhập không thành công. Vui lòng kiểm tra lại tài khoản!";
        }
      } else {
        if (msg) {
          msg.className =
            "p-3 rounded-2xl text-sm font-bold text-center bg-emerald-100 text-emerald-700 border border-emerald-300";
          msg.innerText =
            " Đăng nhập thành công! Đang chuyển hướng vào hệ thống Sign Speak...";
        }
        setTimeout(() => {
          window.location.href = "index.html";
        }, 600);
      }
    });
  }

  const registerForm = document.getElementById("registerForm");
  if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const emailInput = document.getElementById("email");
      const passwordInput = document.getElementById("password");
      const confirmPasswordInput = document.getElementById("confirm-password");
      const fullNameInput = document.getElementById("full-name");
      const roleInput = document.getElementById("role");
      const submitBtn = document.getElementById("submitBtn");
      const msg = document.getElementById("authMessage");

      const phoneInput = document.getElementById("phone");
      const dobInput = document.getElementById("dob");

      const email = emailInput ? emailInput.value.trim() : "";
      const password = passwordInput ? passwordInput.value.trim() : "";
      const confirmPassword = confirmPasswordInput
        ? confirmPasswordInput.value.trim()
        : "";
      const fullName = fullNameInput
        ? fullNameInput.value.trim()
        : "User Sign Speak";
      const role = roleInput ? roleInput.value : "deaf";
      const phone = phoneInput ? phoneInput.value.trim() : "";
      const dob = dobInput ? dobInput.value.trim() : "";

      if (!isValidEmail(email)) {
        if (msg) {
          msg.classList.remove("hidden");
          msg.className =
            "p-3 rounded-2xl text-sm font-bold text-center bg-rose-100 text-rose-700 border border-rose-300";
          msg.innerText =
            "Định dạng Email không hợp lệ! Vui lòng kiểm tra địa chỉ Email (Ví dụ: name@company.com).";
        }
        return;
      }

      if (!phone || phone.length < 9) {
        if (msg) {
          msg.classList.remove("hidden");
          msg.className =
            "p-3 rounded-2xl text-sm font-bold text-center bg-rose-100 text-rose-700 border border-rose-300";
          msg.innerText = "Vui lòng nhập Số điện thoại liên hệ hợp lệ!";
        }
        return;
      }

      if (!dob) {
        if (msg) {
          msg.classList.remove("hidden");
          msg.className =
            "p-3 rounded-2xl text-sm font-bold text-center bg-rose-100 text-rose-700 border border-rose-300";
          msg.innerText = "Vui lòng chọn Ngày tháng năm sinh!";
        }
        return;
      }

      if (password.length < 6) {
        if (msg) {
          msg.classList.remove("hidden");
          msg.className =
            "p-3 rounded-2xl text-sm font-bold text-center bg-rose-100 text-rose-700 border border-rose-300";
          msg.innerText = "Mật khẩu phải có ít nhất 6 ký tự!";
        }
        return;
      }

      if (password !== confirmPassword) {
        if (msg) {
          msg.classList.remove("hidden");
          msg.className =
            "p-3 rounded-2xl text-sm font-bold text-center bg-rose-100 text-rose-700 border border-rose-300";
          msg.innerText = "Mật khẩu xác nhận không trùng khớp!";
        }
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = "Đang tạo tài khoản...";
      }

      const res = await window.supabaseService.signUp(
        email,
        password,
        fullName,
        role,
        phone,
        dob,
      );

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerText = "Đăng ký ngay";
      }

      if (msg) msg.classList.remove("hidden");

      if (res.error) {
        if (msg) {
          msg.className =
            "p-3 rounded-2xl text-sm font-bold text-center bg-rose-100 text-rose-700 border border-rose-300";
          msg.innerText =
            res.error.message ||
            "Đăng ký thất bại. Email có thể đã được sử dụng!";
        }
      } else {
        if (msg) {
          msg.className =
            "p-3 rounded-2xl text-sm font-bold text-center bg-emerald-100 text-emerald-700 border border-emerald-300";
          msg.innerText =
            res.noticeMessage ||
            "🎉 Đăng ký tài khoản thành công! Đang chuyển hướng vào hệ thống Sign Speak...";
        }
        setTimeout(() => {
          window.location.href = "index.html";
        }, 800);
      }
    });
  }
});
