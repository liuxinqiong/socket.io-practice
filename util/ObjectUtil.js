/**
 * Created by sky on 2017/8/3.
 */

function ObjectUtil(){

}

ObjectUtil.prototype.isEmptyObject=function (obj) {
    for(var attr in obj){
        return false;
    }
    return true;
}

module.exports = exports = ObjectUtil;

