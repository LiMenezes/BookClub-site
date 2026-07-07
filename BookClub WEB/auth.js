if (!localStorage.getItem('bookclub_users')) {
    localStorage.setItem('bookclub_users', JSON.stringify({}));
}

function switchAuthMode(mode) {
    if (mode === 'register') {
        document.getElementById('form-login').classList.add('hidden');
        document.getElementById('form-register').classList.remove('hidden');
    } else {
        document.getElementById('form-register').classList.add('hidden');
        document.getElementById('form-login').classList.remove('hidden');
    }
}

function togglePasswordVisibility(id) {
    const el = document.getElementById(id);
    el.type = el.type === 'password' ? 'text' : 'password';
}

document.getElementById('form-login').addEventListener('submit', function(e) {
    e.preventDefault();
    const identifier = document.getElementById('login-identifier').value.trim().toLowerCase();
    const users = JSON.parse(localStorage.getItem('bookclub_users'));
    
    let targetUser = null;
    for (let u in users) {
        if (users[u].email === identifier || users[u].username === identifier) {
            targetUser = users[u];
            break;
        }
    }

    if (targetUser) {
        localStorage.setItem("bookclub_current_user", JSON.stringify(targetUser));
        window.location.href = "home.html";
    } else {
        if (identifier === 'alicia' || identifier === 'alicia@bookclub.com') {
            const admin = {
                name: "Alicia", username: "alicia", email: "alicia@bookclub.com",
                bio: "Leitora ávida por thrillers psicológicos e suspense envolvente.",
                genre: "Thriller Psicológico", target: 12, avatar: "avatar_padrao.jpg"
            };
            users["alicia"] = admin;
            localStorage.setItem('bookclub_users', JSON.stringify(users));
            localStorage.setItem("bookclub_current_user", JSON.stringify(admin));
            window.location.href = "home.html";
        } else {
            alert("Usuário ou e-mail não encontrado!");
        }
    }
});

document.getElementById('form-register').addEventListener('submit', function(e) {
    e.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const username = document.getElementById('reg-username').value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    const email = document.getElementById('reg-email').value.trim().toLowerCase();
    const users = JSON.parse(localStorage.getItem('bookclub_users'));

    if (users[username]) {
        alert("Esse @username já está em uso! Escolha outro único.");
        return;
    }

    const newUser = {
        name: name, username: username, email: email,
        bio: "Novo explorador literário no BookClub.", genre: "Não Definido",
        target: 10, avatar: "avatar_padrao.jpg"
    };

    users[username] = newUser;
    localStorage.setItem('bookclub_users', JSON.stringify(users));
    localStorage.setItem("bookclub_current_user", JSON.stringify(newUser));
    window.location.href = "home.html";
});