/**
 * Created by sky on 2017/7/25.
 */
var app = require('express')();
var http = require('http').Server(app);
var rest = require('restler');
var io = require('socket.io')(http);
var querystring = require('querystring');
var nodemailer = require('nodemailer');

var users={};

var p408={
    lineId:40403,
    vehTime:0720
};

/*
* 余票查询接口格式
* 请求：
* {
*   customerId
*   customerName
*   keyCode
*   lineId
*   vehTime
*   beginDate
*   endDate
* }
* 响应
* {
*   returnCode
*   returnData:{
*       prices:用逗号分隔的字符串，-1表示不可购买。-2表示已经购买，否则表示实际价格
*       tickets：用逗号分隔的字符串，-1表示不可购买。否则表示实时余票信息
*   }
* }
* */

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

function sendEmail(email,text){
    var mailOptions = {
        from: '2478092995@qq.com', // 发送者
        to: email, // 接受者,可以同时发送多个,以逗号隔开
        subject: 'ebus刷票提醒', // 标题
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

function isEmptyObject(obj){
    for(var attr in obj){
      return false;
    }
    return true;
}

app.get('/chat', function(req, res){
    res.sendFile(__dirname + '/index.html');
});

app.get('/ebus',function(eq, res){
    res.sendFile(__dirname + '/ebus.html');
})

io.of('chat').on('connection', function(socket){
    console.log('a user connected');
    socket.on('disconnect', function(){
        console.log('user disconnected');
    });
    socket.on('chat message', function(msg){
        console.log('message: ' + msg);
        io.emit('chat message', msg);
    });
    socket.broadcast.emit('new','hi');
    io.emit('some event', { for: 'everyone' });
});

io.of('/ebus').on('connection',function (socket) {
    console.log('a user connected');
    socket.on('getCode', function(msg){
        console.log(msg);
        if(users[msg.Phone]){
            socket.emit('code',{returnCode:9998,returnInfo:'云端已登录成功，请不要重复登录，否则导致会话失效'});
            return;
        }
        rest.post('http://slb.szebus.net/code/phone/login',{data:msg}).on('complete',function (data, response) {
            socket.emit('code',JSON.parse(data));
        });
    });
    socket.on('login',function (msg) {
        console.log(msg);
        if(users[msg.loginName]){
            socket.emit('loginState',{returnCode:9997,returnInfo:'云端已登录成功，请不要重复登录，否则导致会话失效'});
            return;
        }
        rest.post('http://slb.szebus.net/phone/login/new',{data:msg}).on('complete',function (data, response) {
            data=JSON.parse(data)
            // 登录成功
            if(data.returnCode==500){
                users[msg.loginName]={
                    keyCode:data.keyCode,
                    userId:data.returnData,
                    userName:msg.loginName,
                    sockedId:socket.id,
                    count:0
                };
                console.log(users);
            }
            socket.emit('loginState',data);
        });
    });
    socket.on('start',function(msg){
        console.log(msg);
        if(!msg.Phone){
            socket.emit('searchState',{returnCode:9995,returnInfo:'手机号码是必须的'});
            return;
        }
        if(!msg.Email){
            socket.emit('searchState',{returnCode:9995,returnInfo:'邮箱是必须的'});
            return;
        }
        if(!users[msg.Phone]){
            socket.emit('searchState',{returnCode:9999,returnInfo:'您还没有登录，请按照步骤来！'});
            return;
        }
        if(users[msg.Phone].interval){
            socket.emit('searchState',{returnCode:9995,returnInfo:'云端刷票已经开启成功，请不要重启开启'});
            return;
        }
        users[msg.Phone].email=msg.Email;
        users[msg.Phone].interval=setInterval(function(){
            // 只能查询当月剩余天数
            var date=new Date();
            var tempMonth=(date.getMonth()+1).toString();
            var month=tempMonth.length==1?'0'+tempMonth:tempMonth;
            var tempBeginDate=date.getDate().toString();
            var beginDate=tempBeginDate.length==1?'0'+tempBeginDate:tempBeginDate;
            var year=date.getFullYear();
            var temp=new Date(year,month,0);
            var dayCount=temp.getDate();
            var startDate=year+month+beginDate;
            var endDate=year+month+dayCount;
            var data={
                customerId:users[msg.Phone].userId,
                customerName:users[msg.Phone].userName,
                keyCode:users[msg.Phone].keyCode,
                lineId:p408.lineId,
                vehTime:p408.vehTime,
                beginDate:startDate,
                endDate:endDate
            }
            // todo：云端刷票次数功能
            rest.post('http://slb.szebus.net/bc/phone/surplus/ticket/new',{data:data}).on('complete',function (data, response) {
                var data=JSON.parse(data);
                if(data.returnCode==500){
                    // 进行数据分析，只提示未购买日的有票信息
                    var info={};
                    var date=new Date();
                    var month=date.getMonth()+1+'月';
                    var day=date.getDate();
                    var prices=data.returnData.prices.split(',');
                    var tickets=data.returnData.tickets.split(',');
                    for(var i=0;i<prices.length;i++){
                        var ticket=tickets[i];
                        var price=prices[i];
                        day=day+i+'日';
                        if(price>0&&ticket>0){
                            info[month+day]={
                                date:month+day,
                                ticket:ticket
                            };
                        }
                    }
                    users[msg.Phone].count++;
                    if(isEmptyObject(info)) {
                        // 无票，如果socket在，推送次数
                        socket.emit('countState',{returnCode:10000,returnInfo:'次数查询成功',returnData:{count:users[msg.Phone].count}});
                    }else{
                        // 关闭查询，推送次数，发送邮件
                        clearInterval(users[msg.Phone].interval);
                        socket.emit('countState',{returnCode:10000,returnInfo:'次数查询成功',returnData:{count:users[msg.Phone].count}});
                        var toEmail=users[msg.Phone].email;
                        sendEmail(toEmail,JSON.stringify(info)+'\n'+'本次查票到此结束，需要请购买完成后重新开启，本次共为您查询'+users[msg.Phone].count+'次');
                        delete users[msg.Phone];
                    }
                }else{
                    // 出错，可能是会话失效，直接关闭，并且邮件提醒
                    clearInterval(users[msg.Phone].interval);
                    var toEmail=users[msg.Phone].email;
                    sendEmail(toEmail,'您可能在其他客户端登录，会话失效，云端刷票到此结束');
                    delete users[msg.Phone];
                }
                socket.emit('searchState',data);
            });
        },60000);
        socket.emit('searchState',{returnCode:10000,returnInfo:'云端刷票开启成功，请不要在其他客户端登录，否则导致失效，当前频率1分钟'});
    })

    socket.on('stop',function (msg) {
        if(!msg.Phone){
            socket.emit('stopState',{returnCode:9996,returnInfo:'停止云端刷票，手机号码是必须的'});
        }
        // 关闭轮询
        clearInterval(users[msg.Phone].interval);
        // 删除用户
        delete users[msg.Phone];
        socket.emit('stopState',{returnCode:10000,returnInfo:'停止云端刷票成功'})
    });

    socket.on('count',function (msg) {
        if(!msg.Phone){
            socket.emit('countState',{returnCode:9995,returnInfo:'查询云端刷票，手机号码是必须的'});
        }
        socket.emit('countState',{returnCode:10000,returnInfo:'次数查询成功',returnData:{count:users[msg.Phone].count}});
    })
});

http.listen(3000, function(){
    console.log('listening on *:3000');
});

