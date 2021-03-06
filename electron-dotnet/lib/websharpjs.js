(function()
{
    "use strict";

    let v8Util = process.atomBinding('v8_util');

    const websharpObjectCache = v8Util.createIDWeakMap();
    let websharpObjId = 0;

    var RegisterScriptableObject = function (meta)
    {
        let id = v8Util.getHiddenValue(meta, 'websharpId');
        // We indiscriminately replace the object that is there.
        if (id) {
            websharpObjectCache.set(id, meta);
        }
        else
        {
            id = websharpObjId++;
            v8Util.setHiddenValue(meta, 'websharpId', id);
            websharpObjectCache.set(id, meta);
        }
        return id;

    }

    var GetScriptableObject = function (id) {
        //console.log('get scriptobject with ' + id);
        return websharpObjectCache.get(id);

    }

    var UnRegisterScriptableObject = function (key) {

        console.log('key ' + key );

    }

    var WrapEvent = function (event)
    {
        eventSrcID = (event.srcElement) ? event.srcElement : 'undefined';
        eventtype = event.type;
        status = eventSrcID + ' has received a ' + eventtype + ' event.';
        console.log(event);
        console.log(status);
        buttonname=new Array('Left','Right','','Middle');
            message='button : '+event.button+'\n';
            message+='altKey : '+event.altKey +'\n';
            message+='ctrlKey : '+event.ctrlKey +'\n';
            message+='shiftKey : '+event.shiftKey +'\n';
            console.log(message);
    }

    var UnwrapArgs = function (args) {

        const parmToCallback = function (func) {
            return function () {
                
                // We need to preserver arity of the function callback parameters.
                let callbackData = [];
                // If we get called with arguments then we loop over them to create on object to be passed back
                // as our callback data.  Func<object, Task<object>>
                // We only receive one object in our managed code.
                if (arguments)
                {
                    var args = Array.from(arguments);
                    for (var i = 0; i < args.length; i++) {
                        if (v8Util.getHiddenValue(args[i], 'websharpId'))
                            callbackData.push(ObjectToScriptObject(args[i]));
                        else
                            callbackData.push(args[i]);
                    }
                }

                try {
                    // ** Note **: We are using `this` for the scope of the fuction. This may need to be looked at
                    // later.
                    func.Value.apply(this, [callbackData]);
                }
                catch (ex) { ErrorHandler.Exception(ex); }
                
            };

        }

        const parmToMeta = function (value) {
            if (value) {
                switch (value.Category) {
                    case 1:
                        return GetScriptableObject(value.Value);
                    case 2:
                        let stp = value.Value;
                        let scriptableType = {};
                        Object.getOwnPropertyNames(stp).forEach(function (k) {
                            scriptableType[k] = parmToMeta(stp[k]);
                        });
                        return scriptableType;
                    case 4:
                        return parmToCallback(value);
                    default:
                        return value.Value;
                }
            }
            return value;
        }

        let options = [];
        if (args) {
            var arrayLength = args.length;
            for (var i = 0; i < arrayLength; i++) {
                options.push(parmToMeta(args[i]));
            }
        }
        return options;
    }

    var ObjectToScriptObject = function (objToWrap)
    {
        let id = RegisterScriptableObject(objToWrap);
        let proxy = {};

        proxy.websharp_id = id;
        proxy.websharp_get_property = function (prop, cb) {
            //console.log('prop -> ' + prop + ' has property ' + objToWrap.hasOwnProperty(prop)  + ' [ ' + objToWrap[prop] + ' ]');
            cb(null, objToWrap[prop]);
        }

        proxy.websharp_set_property = function (parms, cb) {
            let result = false;

            if (parms.createIfNotExists === true) {
                objToWrap[parms.property] = parms.value;
                result = true;
            }
            else {
                result = false;
                if (parms.hasOwnProperty === true) {
                    if (objToWrap.hasOwnProperty(parms.property)) {
                        objToWrap[parms.property] = parms.value;
                        result = true;
                    }
                }
                else {
                    objToWrap[parms.property] = parms.value;
                    result = true;
                }

            }
            cb(null, result);
        }
        proxy.websharp_invoke = function (parms, cb) {
            console.log('invoking -> ' + parms.function + ' has function ' + (typeof objToWrap[parms.function] === 'function') + ' args [ ' + parms.args + ' ]');
            let invokeResult;

            if (typeof objToWrap[parms.function] === 'function') {

                let args = UnwrapArgs(parms.args);

                invokeResult = objToWrap[parms.function].apply(objToWrap, args);
                cb(null, invokeResult);
            }
            else
                cb('Function ' + parm.function + ' does not exist. ', invokeResult);

        }

        proxy.websharp_addEventListener = function (eventCallback, cb) {
            //console.log('addEventListener -> ' + eventCallback.onEvent);
            objToWrap.addEventListener(eventCallback.onEvent, 
                function () {
                
                    // We need to preserver arity of the function callback parameters.
                    let callbackData = [];
                    // we will only attach event information if it was asked for
                    if (eventCallback.handlerType) {
                        // If we get called with arguments then we loop over them to create on object to be passed back
                        // as our callback data.  Func<object, Task<object>>
                        // We only receive one object in our managed code.
                        if (arguments) {
                            var args = Array.from(arguments);
                            for (var i = 0; i < args.length; i++) {
                                //console.log(typeof args[i]);
                                var type = args[i].type;
                                if (args[i] instanceof Event) {
                                    //console.log('Event be definfed ');
                                    var event = {};
                                    event['eventType'] = args[i].type;
                                    DOMEventProps.forEach(function (element) {
                                        event[element] = args[i][element];
                                    });
                                    callbackData.push(event);

                                }
                                else
                                    callbackData.push(args[i]);
                            }
                        }
                    }

                    try {
                        // ** Note **: We are using `this` for the scope of the fuction. This may need to be looked at
                        // later.
                        eventCallback.callback.apply(this, [callbackData]);
                    }
                    catch (ex) { ErrorHandler.Exception(ex); }
                
                }, false);
           
            cb(null, true);
        }

        proxy.websharp_proxied_object = function (data, cb) {
            cb(null, proxy.websharp_id);

        }

        return proxy;
    }


    var DOMEventProps = ["altKey",
        "bubbles",
        "cancelable",
        "changedTouches",
        "ctrlKey",
        "detail",
        "eventPhase",
        "metaKey",
        "pageX",
        "pageY",
        "shiftKey",
        "view",
	    "char",
        "charCode",
        "key",
        "keyCode",
        "button",
        "buttons",
        "clientX",
        "clientY",
        "offsetX",
        "offsetY",
        "pointerId",
        "pointerType",
        "screenX",
        "screenY",
        "targetTouches",
        "toElement",
        "touches"]

    module.exports = { RegisterScriptableObject, GetScriptableObject, UnRegisterScriptableObject, WrapEvent, UnwrapArgs, ObjectToScriptObject };

})();