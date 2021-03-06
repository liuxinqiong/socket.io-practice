/**
 * Created by sky on 2017/8/3.
 */

var rest = require('restler');
var ObjectUtilFun = require('../util/ObjectUtil');
var MailUtilFun = require('../util/MailUtil');

var ObjectUtil = new ObjectUtilFun();
var MailUtil = new MailUtilFun();

var users = {};

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

function sendEmails(email, content, subject) {
    var emails = email.split(';');
    for (var i = 0; i < emails.length; i++) {
        MailUtil.sendEmail(emails[i], content, subject);
    }
}

/**
 * 2018/4/9 今天给朋友用，发现接口全部返回为空，看来ebus系统肯定做了修改，看来需要重新fiddler抓包分析一下了！
 * 太尴尬了，哈哈
 */
module.exports = function (io) {
    io.of('/ebus').on('connection', function (socket) {

        console.log('a ebus user connected');

        // 得到验证码
        socket.on('getCode', function (msg) {
            console.log(msg);
            if (users[msg.Phone]) {
                socket.emit('code', {
                    returnCode: -1,
                    returnInfo: '云端已登录成功，请不要重复登录，否则导致会话失效'
                });
                return;
            }
            rest.post('http://slb.szebus.net/code/phone/login', {
                data: msg
            }).on('complete', function (data, response) {
                console.log(data);
                socket.emit('code', JSON.parse(data));
            });
        });

        // 登录
        socket.on('login', function (msg) {
            console.log(msg);
            if (users[msg.loginName]) {
                socket.emit('loginState', {
                    returnCode: -1,
                    returnInfo: '云端已登录成功，请不要重复登录，否则导致会话失效'
                });
                return;
            }
            rest.post('http://slb.szebus.net/phone/login/new', {
                data: msg
            }).on('complete', function (data, response) {
                data = JSON.parse(data)
                // 登录成功
                if (data.returnCode == 500) {
                    users[msg.loginName] = {
                        keyCode: data.keyCode,
                        userId: data.returnData,
                        userName: msg.loginName,
                        sockedId: socket.id,
                        count: 0
                    };
                    console.log(users);
                }
                socket.emit('loginState', data);
            });
        });

        // 查询
        socket.on('search', function (msg) {
            rest.post('http://slb.szebus.net/bc/phone/data', {
                data: msg
            }).on('complete', function (data, response) {
                socket.emit('searchResult', JSON.parse(data));
            });
        });

        // 开始
        socket.on('start', function (msg) {
            console.log(msg);
            if (!msg.Phone) {
                socket.emit('startState', {
                    returnCode: -1,
                    returnInfo: '手机号码是必须的'
                });
                return;
            }
            if (!msg.Email) {
                socket.emit('startState', {
                    returnCode: -1,
                    returnInfo: '邮箱是必须的'
                });
                return;
            }
            if (!users[msg.Phone]) {
                socket.emit('startState', {
                    returnCode: -1,
                    returnInfo: '您还没有登录，请按照步骤来！'
                });
                return;
            }
            if (users[msg.Phone].interval) {
                socket.emit('startState', {
                    returnCode: -1,
                    returnInfo: '云端刷票已经开启成功，请不要重复开启'
                });
                return;
            }
            users[msg.Phone].email = msg.Email;
            users[msg.Phone].interval = setInterval(function () {
                // 只能查询当月剩余天数
                var date = new Date();
                var tempMonth = (date.getMonth() + 1).toString();
                var month = tempMonth.length == 1 ? '0' + tempMonth : tempMonth;
                var tempBeginDate = date.getDate().toString();
                var beginDate = tempBeginDate.length == 1 ? '0' + tempBeginDate : tempBeginDate;
                var year = date.getFullYear();
                var temp = new Date(year, month, 0);
                var dayCount = temp.getDate();
                var startDate = year + month + beginDate;
                var endDate = year + month + dayCount;
                var data = {
                    customerId: users[msg.Phone].userId,
                    customerName: users[msg.Phone].userName,
                    keyCode: users[msg.Phone].keyCode,
                    lineId: msg.lineId,
                    vehTime: msg.vehTime,
                    beginDate: startDate,
                    endDate: endDate
                }
                // 云端刷票次数功能
                rest.post('http://slb.szebus.net/bc/phone/surplus/ticket/new', {
                    data: data
                }).on('complete', function (data, response) {
                    var data = JSON.parse(data);
                    if (data.returnCode == 500) {
                        // 进行数据分析，只提示未购买日的有票信息
                        var info = {};
                        var date = new Date();
                        var month = date.getMonth() + 1 + '月';
                        var day = date.getDate();
                        var prices = data.returnData.prices.split(',');
                        var tickets = data.returnData.tickets.split(',');
                        for (var i = 0; i < prices.length; i++) {
                            var ticket = tickets[i];
                            var price = prices[i];
                            // 当天就不用累加日期了
                            i !== 0 && day++;
                            if (price > 0 && ticket > 0) {
                                info[month + day + '日'] = {
                                    date: month + day + '日',
                                    ticket: ticket
                                };
                            }
                        }
                        users[msg.Phone].count++;
                        if (!ObjectUtil.isEmptyObject(info)) {
                            // 有票，关闭查询，发送邮件
                            //clearInterval(users[msg.Phone].interval);
                            var toEmail = users[msg.Phone].email;
                            sendEmails(toEmail, JSON.stringify(info) + '\n' + '有票啦，请尽快购买，否则会一直吵你，本次共为您查询' + users[msg.Phone].count + '次', 'ebus' + msg.lineId + '车次有符合您的票啦');
                            // 总是错过，不关闭了
                            //delete users[msg.Phone];
                        }
                        // 如果socket在，推送次数
                        socket.emit('countState', {
                            returnCode: 0,
                            returnInfo: '次数查询成功',
                            returnData: {
                                count: users[msg.Phone].count
                            }
                        });
                    } else {
                        // 出错，可能是会话失效，直接关闭，并且邮件提醒
                        clearInterval(users[msg.Phone].interval);
                        var toEmail = users[msg.Phone].email;
                        sendEmails(toEmail, '您可能在其他客户端登录，会话失效，云端刷票到此结束', 'ebus' + msg.lineId + '车次刷票停止啦');
                        delete users[msg.Phone];
                    }
                    socket.emit('searchState', data);
                });
            }, 60000);
            var toEmail = users[msg.Phone].email;
            sendEmails(toEmail, '云端刷票开启成功，请不要在其他客户端登录，否则导致失效，当前频率1分钟', 'ebus' + msg.lineId + '车次刷票提醒你');
            socket.emit('startState', {
                returnCode: 0,
                returnInfo: '云端刷票开启成功，请不要在其他客户端登录，否则导致失效，当前频率1分钟'
            });
        });

        // 停止
        socket.on('stop', function (msg) {
            if (!msg.Phone) {
                socket.emit('stopState', {
                    returnCode: -1,
                    returnInfo: '停止云端刷票，手机号码是必须的'
                });
            }
            if (users[msg.Phone]) {
                var toEmail = users[msg.Phone].email;
                // 关闭轮询
                clearInterval(users[msg.Phone].interval);
                // 删除用户
                delete users[msg.Phone];
                socket.emit('stopState', {
                    returnCode: 0,
                    returnInfo: '停止云端刷票成功'
                });
                sendEmails(toEmail, '人为停止云端刷票成功', 'ebus' + msg.lineId + '刷票提醒你');
            } else {
                socket.emit('stopState', {
                    returnCode: -1,
                    returnInfo: '用户未开启云端刷票'
                });
            }
        });

        // 统计
        socket.on('count', function (msg) {
            if (!msg.Phone) {
                socket.emit('countState', {
                    returnCode: -1,
                    returnInfo: '查询云端刷票，手机号码是必须的'
                });
            }
            if (users[msg.Phone]) {
                socket.emit('countState', {
                    returnCode: 0,
                    returnInfo: '次数查询成功',
                    returnData: {
                        count: users[msg.Phone].count
                    }
                });
            } else {
                socket.emit('countState', {
                    returnCode: -1,
                    returnInfo: '该号码并未开启云端查询',
                    returnData: {
                        count: -1
                    }
                });
            }
        });
    });
}