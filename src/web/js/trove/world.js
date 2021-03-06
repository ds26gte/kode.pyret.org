({
  requires: [
    { "import-type": "builtin", "name": "image-lib" },
    { "import-type": "builtin", "name": "world-lib" },
    { "import-type": "builtin", "name": "valueskeleton" }
  ],
  nativeRequires: ["pyret-base/js/js-numbers"],
  provides: {
    shorthands: {
      "WCOofA": ["tyapp", ["local", "WorldConfigOption"], [["tid", "a"]]],
      "Image": { tag: "name",
                 origin: { "import-type": "uri", uri: "builtin://image" },
                 name: "Image" }
    },
    values: {
      "reactor": ["forall", ["a"], ["arrow", [["tid", "a"], ["List", "WCOofA"]], "Any"]],
      "big-bang": ["forall", ["a"], ["arrow", [["tid", "a"], ["List", "WCOofA"]], ["tid", "a"]]],
      "_patch_big-bang": "tany",
      "animate": "tany",
      "on-tick": ["forall", ["a"],
          ["arrow",
             [["arrow", [ ["tid", "a"] ], ["tid", "a"]]],
             "WCOofA"]],
      "on-tick-n": ["forall", ["a"],
          ["arrow",
             [["arrow", [ ["tid", "a"], "Number" ], ["tid", "a"]]],
             "WCOofA"]],
      "_patch_on-tick": "tany",
      "on-mouse": ["forall", ["a"],
          ["arrow",
             [["arrow", [ ["tid", "a"], "Number", "Number", "String" ], ["tid", "a"]]],
             "WCOofA"]],
      "on-tap": ["forall", ["a"],
          ["arrow",
             [["arrow", [ ["tid", "a"], "String" ], ["tid", "a"]]],
             "WCOofA"]],
      "on-tilt": ["forall", ["a"],
          ["arrow",
             [["arrow", [ ["tid", "a"], "Number", "Number" ], ["tid", "a"]]],
             "WCOofA"]],
      "on-key": ["forall", ["a"],
          ["arrow",
             [["arrow", [ ["tid", "a"], "String" ], ["tid", "a"]]],
             "WCOofA"]],
      "to-draw": ["forall", ["a"],
          ["arrow",
             [["arrow", [ ["tid", "a"] ], "Image"]],
             "WCOofA"]],
      "on-redraw": "tany",
      "stop-when": ["forall", ["a"],
          ["arrow",
             [["arrow", [ ["tid", "a"] ], "Boolean"]],
             "WCOofA"]],
      "last-image": ["forall", ["a"],
          ["arrow",
             [["arrow", [ ["tid", "a"] ], "Image"]],
             "WCOofA"]],
      "close-when-stop": ["forall", ["a"],
          ["arrow",
             ["Boolean"],
             "WCOofA"]],
      "is-world-config": ["arrow", [ "Any" ], "Boolean"],
      "is-key-equal": ["arrow", [ "String", "String" ], "Boolean"],
      "is-mouse-equal": ["arrow", [ "String", "String" ], "Boolean"]
    },
    aliases: {},
    datatypes: {
      "WorldConfigOption": ["data", "WorldConfigOption", ["a"], [], {}]
    }
  },
  theModule: function(runtime, namespace, uri, imageLibrary, rawJsworld, VSlib, jsnums) {
    var isImage = imageLibrary.isImage;
    var VS = runtime.getField(VSlib, "values");

    //////////////////////////////////////////////////////////////////////

    // An Opaque is a Pyret concept for a value wrapping a hidden
    // implementation.  Check that a value is one of these, and internally is
    // a WorldConfigOption
    var isOpaqueWorldConfigOption = function(v) {
      return runtime.isOpaque(v) && isWorldConfigOption(v.val);
    }
    var isOpaqueOnTick = function(v) {
      return runtime.isOpaque(v) && (v.val instanceof OnTick);
    }
    var isOpaqueToDraw = function(v) {
      return runtime.isOpaque(v) && (v.val instanceof ToDraw);
    }

    var makeReactor = function(init, handlers) {
      runtime.ffi.checkArity(2, arguments, "reactor", false);
      runtime.checkList(handlers);
      var arr = runtime.ffi.toArray(handlers);
      var initialWorldValue = init;
      arr.map(function(h) { checkHandler(h); });
      return makeReactorRaw(init, arr, false, []);
    }
    var makeReactorRaw = function(init, handlersArray, tracing, trace) {
      return runtime.makeObject({
        "get-value": runtime.makeMethod0(function(self) {
          return init;
        }),
        "draw": runtime.makeMethod0(function(self) {
          var drawer = handlersArray.filter(function(h) {
            return isOpaqueToDraw(h);
          })[0];
          if(drawer === undefined) {
            runtime.throwMessageException("Tried to draw() a reactor with no to-draw");
          }
          return drawer.val.handler.app(init);
        }),
        interact: runtime.makeMethod0(function(self) {
          var thisInteractTrace = [];
          var tracer = null;
          if(tracing) {
            tracer = function(newVal, oldVal, k) {
              thisInteractTrace.push(newVal);
              k();
            };
          }
          return runtime.safeCall(function() {
            return bigBang(init, handlersArray, tracer);
          }, function(newVal) {
            return makeReactorRaw(newVal, handlersArray, tracing, trace.concat(thisInteractTrace));
          }, "interact");
        }),
        "start-trace": runtime.makeMethod0(function(self) {
          return makeReactorRaw(init, handlersArray, true, []);
        }),
        "stop-trace": runtime.makeMethod0(function(self) {
          return makeReactorRaw(init, handlersArray, false, []);
        }),
        "get-trace": runtime.makeMethod0(function(self) {
          return runtime.ffi.makeList(trace);
        }),
        react: runtime.makeMethod1(function(self, event) {
          if(event === "tick") {
            var ticker = handlersArray.filter(function(h) {
              return isOpaqueOnTick(h);
            })[0];
            if(ticker === undefined) {
              runtime.throwMessageException("Tried to tick a reactor with no on-tick");
            }
            else {
              return runtime.safeCall(function() {
                return ticker.val.handler.app(init);
              }, function(result) {
                var newTrace = trace;
                if(tracing) {
                  newTrace = trace.concat([result]);
                }
                return makeReactorRaw(result, handlersArray, tracing, newTrace);
              }, "react:on-tick");
            }
          }
          else {
            runtime.throwMessageException("Only the literal event \"tick\" is supported");
          }
        }),
        _output: runtime.makeMethod0(function(self) {
          return runtime.getField(VS, "vs-constr").app(
            "reactor",
            runtime.ffi.makeList([
              runtime.getField(VS, "vs-value").app(init),
              runtime.getField(VS, "vs-value").app(runtime.ffi.makeList(trace))]));
        })
      });
    }

    function bigBangFromDict(init, dict, tracer) {
      var handlers = [];
      function add(k, constr) {
        if(dict.hasOwnProperty(k)) {
          handlers.push(runtime.makeOpaque(new constr(dict[k])));
        }
      }
      var title = "reactor";
      if (dict.hasOwnProperty("title")) {
        title = dict["title"];
      }
      if(dict.hasOwnProperty("on-tick")) {
        if(dict.hasOwnProperty("seconds-per-tick")) {
          var delay = dict["seconds-per-tick"];
          delay = jsnums.toFixnum(delay);
          handlers.push(runtime.makeOpaque(new OnTick(dict["on-tick"], delay * 1000)));
        }
        else {
          handlers.push(runtime.makeOpaque(new OnTick(dict["on-tick"], DEFAULT_TICK_DELAY * 1000)));
        }
      }
      add("on-mouse", OnMouse);
      add("on-key", OnKey);
      add("to-draw", ToDraw);
      add("stop-when", StopWhen);
      add("last-image", LastImage);
      add("close-when-stop", CloseWhenStop);

      return bigBang(init, handlers, tracer, title);
    }

    var bigBang = function(initW, handlers, tracer, title) {
      var closeBigBangWindow = null;
      var outerToplevelNode = jQuery('<span/>').css('padding', '0px').get(0);
      // TODO(joe): This obviously can't stay
      if(!runtime.hasParam("current-animation-port")) {
        document.body.appendChild(outerToplevelNode);
      } else {
        runtime.getParam("current-animation-port")(
          outerToplevelNode,
          title,
          function(closeWindow) {
            closeBigBangWindow = closeWindow;
          }
        );
      }

      var toplevelNode = jQuery('<span/>')
          .css('padding', '0px')
          .appendTo(outerToplevelNode)
          .attr('tabindex', 1)
          .focus()
          .get(0);

      var configs = [];
      var isOutputConfigSeen = false;
      var closeWhenStop = false; // true in patch?

      for (var i = 0 ; i < handlers.length; i++) {
        if (isOpaqueCloseWhenStopConfig(handlers[i])) {
          closeWhenStop = handlers[i].val.isClose;
        } else if (isOpaqueWorldConfigOption(handlers[i])) {
          configs.push(handlers[i].val.toRawHandler(toplevelNode));
        }
        else {
          configs.push(handlers[i]);
        }
        if (isOpaqueOutputConfig(handlers[i])) { isOutputConfigSeen = true; }
      }

      // If we haven't seen an onDraw function, use the default one.
      if (! isOutputConfigSeen) {
        configs.push(new DefaultDrawingOutput().toRawHandler(toplevelNode));
      }


      return runtime.pauseStack(function(restarter) {
        rawJsworld.bigBang(
            toplevelNode,
            initW,
            configs,
            {},
            function(finalWorldValue) {
              restarter.resume(finalWorldValue);
            },
            function(err) {
              restarter.error(err);
            },
            {
              closeWhenStop: closeWhenStop,
              closeBigBangWindow: closeBigBangWindow,
              tracer: tracer
            });
      });
    };

    //////////////////////////////////////////////////////////////////////

    // Every world configuration function (on-tick, stop-when, ...)
    // produces a WorldConfigOption instance.
    var WorldConfigOption = function(name) {
      this.name = name;
    };

    WorldConfigOption.prototype.configure = function(config) {
      throw new Error('unimplemented WorldConfigOption');
    };

    WorldConfigOption.prototype.toDomNode = function(params) {
      var span = document.createElement('span');
      span.appendChild(document.createTextNode("(" + this.name + " ...)"));
      return span;
    };

    WorldConfigOption.prototype.toWrittenString = function(cache) {
      return "(" + this.name + " ...)";
    };

    WorldConfigOption.prototype.toDisplayedString = function(cache) {
      return "(" + this.name + " ...)";
    };

    var isWorldConfigOption = function(v) { return v instanceof WorldConfigOption; };

    //////////////////////////////////////////////////////////////////////

    // adaptWorldFunction: Racket-function -> World-CPS
    // Takes a pyret function and converts it to the CPS-style function
    // that our world implementation expects.
    // NOTE(joe):  This expects there to be no active run for runtime
    // (it should be paused).  The run gets paused by pauseStack() in the
    // call to bigBang, so these runs will all be fresh
    var adaptWorldFunction = function(worldFunction) {
      return function() {
        // Consumes any number of arguments.
        var success = arguments[arguments.length - 1];
        // NOTE(joe): don't move this line down, it's *these* args, not
        // any other nested function's args
        var pyretArgs = [].slice.call(arguments, 0, arguments.length - 1);
        runtime.run(function(_, _) {
          // NOTE(joe): adding safecall here to get some meaningful caller frame
          // so error messages know where the call is coming from
          return runtime.safeCall(function() {
            return worldFunction.app.apply(null, pyretArgs);
          }, function(result) {
            //console.log('result=', result);
            return result;
          }, "big-bang");
        }, runtime.namespace,
                    { sync: false },
                    function(result) {
                      if(runtime.isSuccessResult(result)) {
                        success(result.result);
                      }
                      else {
                        return rawJsworld.shutdown({errorShutdown: result.exn});
                      }
                    });
      };
    };

    //////////////////////////////////////////////////////////////////////

    // OnTick: racket-function javascript-float -> handler
    var OnTick = function(handler, aDelay) {
      WorldConfigOption.call(this, 'on-tick');
      this.handler = handler;
      this.delay = aDelay;
    };

    OnTick.prototype = Object.create(WorldConfigOption.prototype);

    OnTick.prototype.toRawHandler = function(toplevelNode) {
      var that = this;
      var worldFunction = adaptWorldFunction(that.handler);
      return rawJsworld.on_tick(this.delay, worldFunction);
    };

    //////////////////////////////////////////////////////////////////////
    var OnKey = function(handler) {
      WorldConfigOption.call(this, 'on-key');
      this.handler = handler;
    }

    OnKey.prototype = Object.create(WorldConfigOption.prototype);

    OnKey.prototype.toRawHandler = function(toplevelNode) {
      var that = this;
      var worldFunction = adaptWorldFunction(that.handler);
      return rawJsworld.on_key(
        function(w, e, success) {
          var keyChar;
          if (e.type === 'keydown') {
            //console.log('pr keydown pressed');
            keyChar = rawJsworld.getKeyCodeName(e);
          } else {
            //console.log('pr keypress?');
            keyChar = String.fromCharCode(e.which).replace(/[^\x00-\xFE]+/g, '');
          }
          worldFunction(w, keyChar, success);
        });
    };


    var getKeyCodeName = function(e) {
      var code = e.charCode || e.keyCode;
      var keyname;
      switch(code) {
      //case 8: keyname = "backspace"; break;
        case 8: keyname = "\b"; break;
      case 9: keyname = "tab"; break;
        case 10: keyname = "newline"; break;
      //case 13: keyname = "enter"; break;
        case 13: keyname = "\r"; break;
      case 16: keyname = "shift"; break;
      case 17: keyname = "control"; break;
      case 18: keyname = "alt"; break;
      case 19: keyname = "pause"; break;
      case 27: keyname = "escape"; break;
      case 33: keyname = "prior"; break;
      case 34: keyname = "next"; break;
      case 35: keyname = "end"; break;
      case 36: keyname = "home"; break;
      case 37: keyname = "left"; break;
      case 38: keyname = "up"; break;
      case 39: keyname = "right"; break;
      case 40: keyname = "down"; break;
      case 42: keyname = "print"; break;
      case 45: keyname = "insert"; break;
      case 46: keyname = "delete"; break;
      case 106: keyname = "*"; break;
      case 107: keyname = "+"; break;
      case 109: keyname = "-"; break;
      case 110: keyname = "."; break;
      case 111: keyname = "/"; break;
      case 144: keyname = "numlock"; break;
      case 145: keyname = "scroll"; break;
      case 186: keyname = ";"; break;
      case 187: keyname = "="; break;
      case 188: keyname = ","; break;
      case 189: keyname = "-"; break;
      case 190: keyname = "."; break;
      case 191: keyname = "/"; break;
      case 192: keyname = "`"; break;
      case 219: keyname = "["; break;
      case 220: keyname = "\\"; break;
      case 221: keyname = "]"; break;
      case 222: keyname = "'"; break;
      case 230: keyname = 'ralt'; break;
      default:
        if (code >= 96 && code <= 105) {
          keyname = (code - 96).toString();
        } else if (code >= 112 && code <= 123) {
          keyname = "f" + (code - 111);
        } else {
          keyname = String.fromCharCode(code).toLowerCase();
        }
        break;
      }
      return keyname;
    }
    //////////////////////////////////////////////////////////////////////

    var OnMouse = function(handler) {
      WorldConfigOption.call(this, 'on-mouse');
      this.handler = handler;
    }

    OnMouse.prototype = Object.create(WorldConfigOption.prototype);

    OnMouse.prototype.toRawHandler = function(toplevelNode) {
      var that = this;
      var worldFunction = adaptWorldFunction(that.handler);
      return rawJsworld.on_mouse(worldFunction);
    };

    /////

    var OnTap = function(handler) {
      WorldConfigOption.call(this, 'on-tap');
      this.handler = handler;
    }

    OnTap.prototype = Object.create(WorldConfigOption.prototype);

    OnTap.prototype.toRawHandler = function(toplevelNode) {
      var that = this;
      var worldFunction = adaptWorldFunction(that.handler);
      return rawJsworld.on_tap(worldFunction);
    };

    /////

    var OnTilt = function(handler) {
      WorldConfigOption.call(this, 'on-tilt');
      this.handler = handler;
    }

    OnTilt.prototype = Object.create(WorldConfigOption.prototype);

    OnTilt.prototype.toRawHandler = function(toplevelNode) {
      var that = this;
      var worldFunction = adaptWorldFunction(that.handler);
      return rawJsworld.on_tilt(worldFunction);
    };

    var OutputConfig = function() {}
    OutputConfig.prototype = Object.create(WorldConfigOption.prototype);
    var isOutputConfig = function(v) { return v instanceof OutputConfig; };
    var isOpaqueOutputConfig = function(v) {
      return runtime.isOpaque(v) && isOutputConfig(v.val);
    }

    // // ToDraw

    var ToDraw = function(handler) {
      WorldConfigOption.call(this, 'to-draw');
      this.handler = handler;
    };

    ToDraw.prototype = Object.create(OutputConfig.prototype);

    function renderImageonCanvas(theImage, reusableCanvas) {
      var width = theImage.getWidth();
      var height = theImage.getHeight();
      if (reusableCanvas.width !== width) {
        reusableCanvas.width = width;
      }
      if (reusableCanvas.height !== height) {
        reusableCanvas.height = height;
      }
      var ctx = reusableCanvas.getContext("2d");
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,1)";
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
      theImage.render(ctx, 0, 0);
    }

    function setCssforCanvas(reusableCanvas, k) {
      if (reusableCanvas) {
        k([[reusableCanvas,
            ["padding", "0px"],
            ["width", reusableCanvas.width + "px"],
            ["height", reusableCanvas.height + "px"]]]);
      } else {
        k([]);
      }
    }

    ToDraw.prototype.toRawHandler = function(toplevelNode) {
      var that = this;
      var reusableCanvas;
      var reusableCanvasNode;
      var adaptedWorldFunction = adaptWorldFunction(this.handler);

      var worldFunction = function(world, success) {

        adaptedWorldFunction(
            world,
            function(v) {
              // fixme: once jsworld supports fail continuations, use them
              // to check the status of the scene object and make sure it's an
              // image.

              var checkImagePred = function(val) {
                return runtime.isOpaque(val) && isImage(val.val);
              };
              var checkImageType = runtime.makeCheckType(checkImagePred, "Image");
              checkImageType(v);

              var theImage = v.val;
              var width = theImage.getWidth();
              var height = theImage.getHeight();

              if (! reusableCanvas) {
                reusableCanvas = imageLibrary.makeCanvas(width, height);
                // Note: the canvas object may itself manage objects,
                // as in the case of an excanvas.  In that case, we must make
                // sure jsworld doesn't try to disrupt its contents!
                reusableCanvas.jsworldOpaque = true;
                reusableCanvasNode = rawJsworld.node_to_tree(reusableCanvas);
              }
              renderImageonCanvas(theImage, reusableCanvas);
              success([toplevelNode, reusableCanvasNode]);
            });
      };

      var cssFunction = function(w, k) {
        setCssforCanvas(reusableCanvas, k);
      }

      return rawJsworld.on_draw(worldFunction, cssFunction);
    };

    var DefaultDrawingOutput = function() {
      WorldConfigOption.call(this, 'to-draw');
    };

    DefaultDrawingOutput.prototype = Object.create(WorldConfigOption.prototype);

    DefaultDrawingOutput.prototype.toRawHandler = function(toplevelNode) {
      var that = this;
      var worldFunction = function(world, success) {
        var textNode = jQuery("<pre>");
        return runtime.safeCall(function() {
          return runtime.toReprJS(world, runtime.ReprMethods._torepr);
        }, function(str) {
          textNode.text(str);
          success([toplevelNode,
                   rawJsworld.node_to_tree(textNode[0])]);
        }, "default-drawing:toRepr");
      };
      var cssFunction = function(w, success) { success([]); }
      return rawJsworld.on_draw(worldFunction, cssFunction);
    };

    //////////////////////////////////////////////////////////////////////

    var CloseWhenStop = function(isClose) {
      WorldConfigOption.call(this, 'close-when-stop');
      this.isClose = runtime.isPyretTrue(isClose);
    };

    CloseWhenStop.prototype = Object.create(WorldConfigOption.prototype);

    var isCloseWhenStopConfig = function(v) { return v instanceof CloseWhenStop; };
    var isOpaqueCloseWhenStopConfig = function(v) {
      return runtime.isOpaque(v) && isCloseWhenStopConfig(v.val);
    }

    var StopWhen = function(handler) {
      WorldConfigOption.call(this, 'stop-when');
      this.handler = handler;
    };

    StopWhen.prototype = Object.create(WorldConfigOption.prototype);

    StopWhen.prototype.toRawHandler = function(toplevelNode) {
      var that = this;
      var worldFunction = adaptWorldFunction(that.handler);
      return rawJsworld.stop_when(worldFunction);
    };

    var LastImage = function(handler) {
      WorldConfigOption.call(this, 'last-image');
      this.handler = handler;
    };

    LastImage.prototype = Object.create(WorldConfigOption.prototype);

    LastImage.prototype.toRawHandler = function(toplevelNode) {
      var that = this;
      var reusableCanvas, reusableCanvasNode;
      var lastImageFunction = function() {
        var nextFrame = function(t, success) {
          var lih = adaptWorldFunction(that.handler);
          lih(t, function(theImageObj) {
            var theImage = theImageObj.val;
            if (imageLibrary.isImage(theImage)) {
              setTimeout(function() {
                if (!reusableCanvas) {
                  reusableCanvas = imageLibrary.makeCanvas(10, 10);
                  reusableCanvas.jsworldOpaque = true;
                  reusableCanvasNode = rawJsworld.node_to_tree(reusableCanvas);
                }
                renderImageonCanvas(theImage, reusableCanvas);
                success([toplevelNode, reusableCanvasNode]);
              }, 0);
            } else {
              runtime.ffi.throwMessageException('stop-when handler is expected to return a scene or image');
            }
          });
        };
        var lastImageCss = function(w, k) {
          setCssforCanvas(reusableCanvas, k);
        };
        return rawJsworld.on_draw(nextFrame, lastImageCss);
      };
      return rawJsworld.last_image(lastImageFunction);
    };

    var checkHandler = runtime.makeCheckType(isOpaqueWorldConfigOption, "WorldConfigOption");
    //////////////////////////////////////////////////////////////////////

    // The default tick delay is 28 times a second.
    var DEFAULT_TICK_DELAY = 1/28;

    var makeObject = runtime.makeObject;
    var makeFunction = runtime.makeFunction;

    return runtime.makeModuleReturn(
      {
        "reactor": makeFunction(makeReactor, "reactor"),
        "big-bang": makeFunction(function(init, handlers) {
          runtime.ffi.checkArity(2, arguments, "big-bang", false);
          runtime.checkList(handlers);
          var arr = runtime.ffi.toArray(handlers);
          var initialWorldValue = init;
          arr.map(function(h) { checkHandler(h); });
          return bigBang(initialWorldValue, arr, null, 'big-bang');
          runtime.ffi.throwMessageException("Internal error in bigBang: stack not properly paused and stored.");
        }, "big-bang"),

        "_patch_big-bang": makeFunction(function(init) {
          runtime.ffi.checkArityAtLeast(2, arguments, "_patch_big-bang", false);
          var arr = [], h;
          for (var i = 1; i < arguments.length; i++) {
            h = arguments[i];
            checkHandler(h);
            arr.push(h);
          }
          return bigBang(init, arr, null, '_patch_big-bang');
          runtime.ffi.throwMessageException("Internal error in bigBang: stack not properly paused and stored.");
        }),

        "animate": makeFunction(function(f) {
          runtime.ffi.checkArity(1, arguments, "animate", false);
          runtime.checkFunction(f);
          var arr = [];
          arr.push(runtime.makeOpaque(new ToDraw(f)));
          arr.push(runtime.makeOpaque(new OnTick(makeFunction(function(n) { return n+1; }),
            Math.floor(DEFAULT_TICK_DELAY * 1000))));
          return bigBang(1, arr);
          runtime.ffi.throwMessageException("Internal error in bigBang: stack not properly paused and stored.");
        }, "animate"),

        "on-tick": makeFunction(function(handler) {
          runtime.ffi.checkArity(1, arguments, "on-tick", false);
          runtime.checkFunction(handler);
          return runtime.makeOpaque(new OnTick(handler, Math.floor(DEFAULT_TICK_DELAY * 1000)));
        }),
        "on-tick-n": makeFunction(function(handler, n) {
          runtime.ffi.checkArity(2, arguments, "on-tick-n", false);
          runtime.checkFunction(handler);
          runtime.checkNumber(n);
          var fixN = jsnums.toFixnum(n);
          return runtime.makeOpaque(new OnTick(handler, fixN * 1000));
        }),

        "_patch_on-tick": makeFunction(function(handler, n) {
          runtime.ffi.checkArity(arguments.length <= 1? 1: 2, arguments, "_patch_on-tick", false);
          runtime.checkFunction(handler);
          var fixN;
          if (arguments.length >= 2) {
            fixN = typeof n === "number"? n: n.toFixnum();
          } else {
            fixN = DEFAULT_TICK_DELAY;
          }
          return runtime.makeOpaque(new OnTick(handler, fixN * 1000));
        }),

        "to-draw": makeFunction(function(drawer) {
          runtime.ffi.checkArity(1, arguments, "to-draw", false);
          runtime.checkFunction(drawer);
          return runtime.makeOpaque(new ToDraw(drawer));
        }),
        "on-redraw": makeFunction(function(drawer) {
          // Patch alias for to-draw
          runtime.ffi.checkArity(1, arguments, "on-redraw");
          runtime.checkFunction(drawer);
          return runtime.makeOpaque(new ToDraw(drawer));
        }),
        "stop-when": makeFunction(function(stopper) {
          runtime.ffi.checkArity(1, arguments, "stop-when");
          runtime.checkFunction(stopper);
          return runtime.makeOpaque(new StopWhen(stopper));
        }),
        "last-image": makeFunction(function(lastImageHandler) {
          runtime.ffi.checkArity(1, arguments, "last-image", false);
          runtime.checkFunction(lastImageHandler);
          return runtime.makeOpaque(new LastImage(lastImageHandler));
        }),
        "close-when-stop": makeFunction(function(isClose) {
          runtime.ffi.checkArity(1, arguments, "close-when-stop", false);
          runtime.checkBoolean(isClose);
          return runtime.makeOpaque(new CloseWhenStop(isClose));
        }),
        "on-key": makeFunction(function(onKey) {
          runtime.ffi.checkArity(1, arguments, "on-key", false);
          runtime.checkFunction(onKey);
          return runtime.makeOpaque(new OnKey(onKey));
        }),
        "on-mouse": makeFunction(function(onMouse) {
          runtime.ffi.checkArity(1, arguments, "on-mouse", false);
          runtime.checkFunction(onMouse);
          return runtime.makeOpaque(new OnMouse(onMouse));
        }),
        "on-tap": makeFunction(function(onTap) {
          runtime.ffi.checkArity(1, arguments, "on-tap", false);
          runtime.checkFunction(onTap);
          return runtime.makeOpaque(new OnTap(onTap));
        }),
        "on-tilt": makeFunction(function(onTilt) {
          runtime.ffi.checkArity(1, arguments, "on-tilt", false);
          runtime.checkFunction(onMouse);
          return runtime.makeOpaque(new OnTilt(onTilt));
        }),
        "is-world-config": makeFunction(function(v) {
          runtime.ffi.checkArity(1, arguments, "is-world-config", false);
          if(!runtime.isOpaque(v)) { return runtime.pyretFalse; }
          return runtime.makeBoolean(isWorldConfigOption(v.val));
        }),
        "is-key-equal": makeFunction(function(key1, key2) {
          runtime.ffi.checkArity(2, arguments, "is-key-equal", false);
          runtime.checkString(key1);
          runtime.checkString(key2);
          //console.log('doing is-key-equal', key1, key1.charCodeAt(0), key2, key2.charCodeAt(0));
          return key1.toString().toLowerCase() === key2.toString().toLowerCase();
        }),
        "is-mouse-equal": makeFunction(function(mouse1, mouse2) {
          runtime.ffi.checkArity(2, arguments, "is-mouse-equal", false);
          runtime.checkString(mouse1);
          runtime.checkString(mouse2);
          return mouse1.toString().toLowerCase() === mouse2.toString().toLowerCase();
        })
      },
      {},
      {
        WorldConfigOption: WorldConfigOption,
        adaptWorldFunction: adaptWorldFunction,
        bigBangFromDict: bigBangFromDict
      }
    );
  }
})
