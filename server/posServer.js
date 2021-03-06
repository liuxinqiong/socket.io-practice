/**
 * Created by sky on 2017/8/3.
 */

var users={};

function deleteUserBySocketId(socketId){
    for(var attr in users){
        if(users[attr].socketId==socketId){
            delete users[attr];
            return;
        }
    }
}

module.exports=function(io){
    var ioPos=io.of('/pos');
    ioPos.on('connection',function(socket){
        console.log('pos connected');
        // 用户登录，缓存在线列表 todo：同一个账号多处登录
        socket.on('loginPos',function (data) {
            console.log('pos loginPos');
            users[data.userId]={
                userId:data.userId,
                socketId:socket.id
            };
            // 新用户连接，告诉其他人我上线啦
            socket.broadcast.emit('onLineList',Object.keys(users));
        });

        // 管理员才发布获取在线列表请求
        socket.on('getOnlineListReq',function(){
            console.log('pos loginPos');
            socket.emit('onLineList',Object.keys(users));
        });

        // 根据用户id，找到指定socket，然后发布请求
        socket.on('getPosByUserId',function(data){
            console.log('pos getPosByUserId');
            var user=users[data.userId];
            if(user){
                // 发布请求，监听响应
                var socketId=user.socketId;
                var targetSocket=ioPos.sockets[socketId];
                if(targetSocket){
                    // disconnect事件可能没触发，但是socket已经不存在
                    targetSocket.emit('getPosReq');
                    targetSocket.on('getPosRes',function (_data) {
                        // 定位权限未打开
                        if(_data.code===0){
                            // 定位成功
                            socket.emit('posResult', {
                                resultCode: 0,
                                resultInfo: '定位成功',
                                resultData: {
                                    position: _data.position,
                                    userId:data.userId
                                }
                            });
                        }else{
                            // 定位失败，定位出错或定位功能未开启
                            socket.emit('posResult', {
                                resultCode: -2,
                                resultInfo: '定位出错，用户定位功能可能未开启',
                                resultData: {
                                    position: null,
                                    userId:data.userId
                                }
                            });
                        }
                    });
                }else{
                    // 不存在
                    socket.emit('posResult',{
                        resultCode:-1,
                        resultInfo:'用户不在线',
                        resultData:{
                            userId:data.userId,
                            position: null
                        }
                    });
                }
            }else{
                // 不存在
                socket.emit('posResult',{
                    resultCode:-1,
                    resultInfo:'用户不在线',
                    resultData:{
                        userId:data.userId,
                        position: null
                    }
                });
            }
        });

        // 用户切换账号，todo：sokcet本身自带断开方法
        socket.on('logout',function (data) {
            console.log('user logout');
            // 删除
            if(users[data.userId]){
                delete users[data.userId];
            }
            // 发布最新列表
            ioPos.emit('onLineList',Object.keys(users));
        });
        
        socket.on('disconnect',function(){
            console.log('disconnect');
            // 删除离线用户
            deleteUserBySocketId(socket.id);
            // 用户断开连接，通知其他人有人离线了
            ioPos.emit('onLineList',Object.keys(users));
        });
    })
}