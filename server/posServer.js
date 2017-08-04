/**
 * Created by sky on 2017/8/3.
 */

var users={};

if(!Object.values){
    Object.values=function(obj){
        var ary=[];
        var keys=Object.keys(obj);
        for(var i=0;i<keys.length;i++){
            ary.push(obj[keys[i]]);
        }
        return ary;
    }
}

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
        });

        // 新用户连接，发布在线列表
        ioPos.emit('onLineList',Object.values(users));

        // 管理员才发布，获取在线列表
        socket.on('getOnlineListReq',function(){
            console.log('pos loginPos');
            ioPos.emit('onLineList',Object.values(users));
        });

        // 根据用户id，找到指定socket，然后发布请求
        socket.on('getPosByUserId',function(data){
            console.log('pos getPosByUserId');
            var socketId=users[data.userId].socketId;
            if(socketId){
                // 发布请求，监听响应
                ioPos.sockets[socketId].emit('getPosReq');
                ioPos.sockets[socketId].on('getPosRes',function (_data) {
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
        });

        socket.on('disconnection',function(){
            // 删除离线用户
            deleteUserBySocketId(socket.id);
            // 发布最新在线列表，管理员才监听，因此全部广播
            ioPos.emit('onLineList',Object.values(users));
        });
    })
}