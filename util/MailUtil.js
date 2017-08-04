/**
 * Created by sky on 2017/8/3.
 */

var nodemailer = require('nodemailer');

/*
 * 邮箱
 * pass：jqlwzvbdlhivebeb
 * */
var transporter = nodemailer.createTransport({
    service: 'qq',
    auth: {
        user: '2478092995@qq.com',
        pass: 'jqlwzvbdlhivebeb' //授权码,通过QQ获取
    }
});

function MailUtil(){

}

MailUtil.prototype.sendEmail=function (email,text,subject) {
    var mailOptions = {
        from: '2478092995@qq.com', // 发送者
        to: email, // 接受者,可以同时发送多个,以逗号隔开
        subject: subject, // 标题
        text: text, // 文本
    };
    transporter.sendMail(mailOptions, function (err, info) {
        if (err) {
            console.log(err);
            return;
        }
        console.log('发送成功');
    });
}

module.exports = exports = MailUtil;