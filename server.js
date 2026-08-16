require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');
const axios = require('axios');

const app = express();
const API = 'https://discord.com/api/v10';

/* ================= قاعدة البيانات (نفس بيانات البوت) ================= */
// سكيمات مبسطة بس تكفي اللي نعرضه (كاش، بنك، بيانات الهوية) - ما تأثر على باقي بيانات البوت
const userSchema = new mongoose.Schema({
    guild: String,
    user: String,
    characters: [{
        cash: Number,
        bank: Number,
        id: {
            first: String, last: String, date: String, place: String,
            gender: String, number: Number, iban: String, job: String,
            accepted: Boolean, mdt: String
        }
    }]
}, { strict: false });

const guildSchema = new mongoose.Schema({
    guild: String,
    idd: { role: String }
}, { strict: false });

const User = mongoose.model('userBase', userSchema);
const GuildBase = mongoose.model('guildBase', guildSchema);

/* ================= أدوات ديسكورد ================= */
async function exchangeCode(code) {
    const params = new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.REDIRECT_URI
    });
    const { data } = await axios.post(`${API}/oauth2/token`, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return data;
}

async function fetchDiscordUser(accessToken) {
    const { data } = await axios.get(`${API}/users/@me`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    return data;
}

async function fetchGuildMember(userId) {
    try {
        const { data } = await axios.get(
            `${API}/guilds/${process.env.GUILD_ID}/members/${userId}`,
            { headers: { Authorization: `Bot ${process.env.TOKEN}` } }
        );
        return data;
    } catch (err) {
        if (err.response && err.response.status === 404) return null;
        throw err;
    }
}

/* ================= السيشن ================= */
app.use(express.static(__dirname)); // يخدم index.html تلقائي من نفس المجلد
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
}));

/* ================= المسارات ================= */
app.get('/auth/discord', (req, res) => {
    const params = new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        redirect_uri: process.env.REDIRECT_URI,
        response_type: 'code',
        scope: 'identify'
    });
    res.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
});

app.get('/auth/discord/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.redirect('/?error=no_code');

    try {
        const token = await exchangeCode(code);
        const discordUser = await fetchDiscordUser(token.access_token);
        const member = await fetchGuildMember(discordUser.id);

        if (!member) {
            req.session.discordUser = discordUser;
            req.session.hasIdentityRole = false;
            req.session.reason = 'انت مو عضو داخل سيرفر الديسكورد حق الرول بلاي.';
            return res.redirect('/');
        }

        const guildSettings = await GuildBase.findOne({ guild: process.env.GUILD_ID });
        const identityRoleId = guildSettings && guildSettings.idd && guildSettings.idd.role;
        const hasIdentityRole = Boolean(identityRoleId) && member.roles.includes(identityRoleId);

        req.session.discordUser = { id: discordUser.id, username: discordUser.username, avatar: discordUser.avatar };
        req.session.hasIdentityRole = hasIdentityRole;
        req.session.reason = hasIdentityRole ? null : 'لازم تكون معك رتبة الهوية المفعّلة من الإدارة.';

        res.redirect('/');
    } catch (err) {
        console.error('OAuth error:', err.response?.data || err.message);
        res.redirect('/?error=auth_failed');
    }
});

app.post('/auth/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/'));
});

// الواجهة تسحب كل بياناتها من هنا (JSON)
app.get('/api/profile', async (req, res) => {
    if (!req.session.discordUser) {
        return res.json({ loggedIn: false });
    }
    if (!req.session.hasIdentityRole) {
        return res.json({ loggedIn: true, hasRole: false, user: req.session.discordUser, reason: req.session.reason });
    }

    const doc = await User.findOne({ guild: process.env.GUILD_ID, user: req.session.discordUser.id });
    const characters = (doc && doc.characters) || [];

    let index = parseInt(req.query.char, 10);
    if (Number.isNaN(index) || index < 0 || index >= characters.length) index = 0;

    res.json({
        loggedIn: true,
        hasRole: true,
        user: req.session.discordUser,
        characters,
        selectedIndex: index,
        selected: characters[index] || null
    });
});

const PORT = process.env.PORT || 3000;
mongoose.connect(process.env.MONGODB_URI)
    .then(() => app.listen(PORT, () => console.log(`🚀 شغال على المنفذ ${PORT}`)))
    .catch(err => { console.error('❌ فشل الاتصال بقاعدة البيانات:', err.message); process.exit(1); });
