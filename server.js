const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 80;
const upload = multer({ dest: '/tmp/uploads/' });

// 微信配置（建议在云托管环境变量中配置，这里用默认值）
const APP_ID = process.env.WECHAT_APPID || 'wxb43f2eb90a7e8f61';
const APP_SECRET = process.env.WECHAT_APPSECRET || '7e0ded8c0043b82250b67ea3856bd811';

// 获取access_token
async function getToken() {
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APP_ID}&secret=${APP_SECRET}`;
  const res = await axios.get(url);
  if (res.data.errcode) throw new Error(`Token error ${res.data.errcode}: ${res.data.errmsg}`);
  return res.data.access_token;
}

// 上传封面图
async function uploadCover(token, filePath) {
  const form = new FormData();
  form.append('media', fs.createReadStream(filePath));
  const url = `https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${token}&type=thumb`;
  const res = await axios.post(url, form, { headers: form.getHeaders() });
  if (res.data.errcode) throw new Error(`Cover upload error ${res.data.errcode}: ${res.data.errmsg}`);
  return res.data.media_id;
}

// 创建草稿
async function createDraft(token, title, html, thumbMediaId) {
  const url = `https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${token}`;
  const body = {
    articles: [{
      title: title,
      content: html,
      author: '苏安',
      thumb_media_id: thumbMediaId,
      need_open_comment: 1,
      only_fans_can_comment: 0,
    }]
  };
  const res = await axios.post(url, body, { headers: { 'Content-Type': 'application/json' } });
  if (res.data.errcode) throw new Error(`Draft error ${res.data.errcode}: ${res.data.errmsg}`);
  return res.data.media_id;
}

// 发布接口
app.post('/publish', upload.fields([
  { name: 'cover', maxCount: 1 },
  { name: 'html', maxCount: 1 }
]), async (req, res) => {
  try {
    const title = req.body.title;
    if (!title) return res.json({ errcode: -1, errmsg: '缺少title' });

    // 读取HTML内容
    let html = '';
    if (req.files && req.files.html && req.files.html[0]) {
      html = fs.readFileSync(req.files.html[0].path, 'utf-8');
    } else if (req.body.html) {
      html = Buffer.from(req.body.html, 'base64').toString('utf-8');
    } else {
      return res.json({ errcode: -1, errmsg: '缺少html内容' });
    }

    console.log(`收到发布请求: ${title}, HTML: ${html.length}字符`);

    // 获取token
    const token = await getToken();
    console.log('Token获取成功');

    // 上传封面
    let thumbMediaId = '';
    if (req.files && req.files.cover && req.files.cover[0]) {
      thumbMediaId = await uploadCover(token, req.files.cover[0].path);
      console.log(`封面上传成功: ${thumbMediaId}`);
    }

    // 创建草稿
    const mediaId = await createDraft(token, title, html, thumbMediaId);
    console.log(`草稿创建成功: ${mediaId}`);

    // 清理临时文件
    if (req.files) {
      for (const key of Object.keys(req.files)) {
        for (const f of req.files[key]) {
          try { fs.unlinkSync(f.path); } catch(e) {}
        }
      }
    }

    res.json({ errcode: 0, errmsg: 'ok', media_id: mediaId });
  } catch (e) {
    console.error('发布失败:', e.message);
    res.json({ errcode: -1, errmsg: e.message });
  }
});

// 健康检查
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'wechat-publish-proxy' });
});

app.listen(PORT, () => {
  console.log(`服务已启动，端口: ${PORT}`);
});
