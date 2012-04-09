(function() {

  window.Offline = {
    VERSION: '0.1.1',
    localSync: function(method, model, options, store) {
      var resp;
      resp = (function() {
        switch (method) {
          case 'read':
            if (_.isUndefined(model.id)) {
              return store.findAll();
            } else {
              return store.find(model);
            }
            break;
          case 'create':
            return store.create(model, options);
          case 'update':
            return store.update(model, options);
          case 'delete':
            return store.destroy(model, options);
        }
      })();
      if (resp) {
        return options.success(resp);
      } else {
        return options.error('Record not found');
      }
    },
    sync: function(method, model, options) {
      var store, _ref;
      store = model.storage || ((_ref = model.collection) != null ? _ref.storage : void 0);
      if (store) {
        return Offline.localSync(method, model, options, store);
      } else {
        return Backbone.ajaxSync(method, model, options);
      }
    }
  };

  Backbone.ajaxSync = Backbone.sync;

  Backbone.sync = Offline.sync;

  Offline.Storage = (function() {

    function Storage(name, collection, options) {
      this.name = name;
      if (options == null) options = {};
      this.allIds = new Offline.Index(this.name);
      this.destroyIds = new Offline.Index("" + this.name + "-destroy");
      this.sync = new Offline.Sync(collection, this);
      this.keys = options.keys || {};
    }

    Storage.prototype.create = function(model, options) {
      var _ref, _ref2;
      if (options == null) options = {};
      model.set({
        sid: ((_ref = model.attributes) != null ? _ref.sid : void 0) || ((_ref2 = model.attributes) != null ? _ref2.id : void 0) || 'new',
        id: this.guid()
      });
      return this.save(model, options);
    };

    Storage.prototype.update = function(model, options) {
      if (options == null) options = {};
      return this.save(model, options);
    };

    Storage.prototype.destroy = function(model, options) {
      var sid;
      if (options == null) options = {};
      if (!(options.local || (sid = model.get('sid')) === 'new')) {
        this.destroyIds.add(sid);
      }
      return this.remove(model);
    };

    Storage.prototype.find = function(model) {
      return JSON.parse(localStorage.getItem("" + this.name + "-" + model.id));
    };

    Storage.prototype.findAll = function() {
      var id, _i, _len, _ref, _results;
      if (this.isEmpty()) {
        this.sync.full();
      } else {
        this.sync.incremental();
      }
      _ref = this.allIds.values;
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        id = _ref[_i];
        _results.push(JSON.parse(localStorage.getItem("" + this.name + "-" + id)));
      }
      return _results;
    };

    Storage.prototype.s4 = function() {
      return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
    };

    Storage.prototype.guid = function() {
      return this.s4() + this.s4() + '-' + this.s4() + '-' + this.s4() + '-' + this.s4() + '-' + this.s4() + this.s4() + this.s4();
    };

    Storage.prototype.save = function(item, options) {
      if (options == null) options = {};
      if (!options.local) {
        item.set({
          updated_at: (new Date()).toJSON(),
          dirty: true
        });
      }
      this.replaceKeyFields(item, 'local');
      localStorage.setItem("" + this.name + "-" + item.id, JSON.stringify(item));
      this.allIds.add(item.id);
      return item;
    };

    Storage.prototype.remove = function(item) {
      localStorage.removeItem("" + this.name + "-" + item.id);
      this.allIds.remove(item.id);
      return item;
    };

    Storage.prototype.isEmpty = function() {
      return localStorage.getItem(this.name) === null;
    };

    Storage.prototype.clear = function() {
      var collectionKeys, key, keys, record, _i, _j, _len, _len2, _ref, _results,
        _this = this;
      keys = Object.keys(localStorage);
      collectionKeys = _.filter(keys, function(key) {
        return (new RegExp(_this.name)).test(key);
      });
      for (_i = 0, _len = collectionKeys.length; _i < _len; _i++) {
        key = collectionKeys[_i];
        localStorage.removeItem(key);
      }
      localStorage.setItem(this.name, '');
      _ref = [this.allIds, this.destroyIds];
      _results = [];
      for (_j = 0, _len2 = _ref.length; _j < _len2; _j++) {
        record = _ref[_j];
        _results.push(record.reset());
      }
      return _results;
    };

    Storage.prototype.replaceKeyFields = function(item, method) {
      var collection, field, newValue, replacedField, wrapper, _ref, _ref2, _ref3;
      if (item.attributes) item = item.attributes;
      _ref = this.keys;
      for (field in _ref) {
        collection = _ref[field];
        replacedField = item[field];
        if (!/^\w{8}-\w{4}-\w{4}/.test(replacedField) || method !== 'local') {
          newValue = method === 'local' ? (wrapper = new Offline.Collection(collection), (_ref2 = wrapper.get(replacedField)) != null ? _ref2.id : void 0) : (_ref3 = collection.get(replacedField)) != null ? _ref3.get('sid') : void 0;
          if (!_.isUndefined(newValue)) item[field] = newValue;
        }
      }
      return item;
    };

    return Storage;

  })();

  Offline.Sync = (function() {

    function Sync(collection, storage) {
      this.collection = new Offline.Collection(collection);
      this.storage = storage;
    }

    Sync.prototype.full = function(options) {
      var _this = this;
      if (options == null) options = {};
      return Backbone.ajaxSync('read', this.collection.items, {
        success: function(response, status, xhr) {
          var item, _i, _len;
          _this.storage.clear();
          for (_i = 0, _len = response.length; _i < _len; _i++) {
            item = response[_i];
            _this.collection.items.create(item, {
              local: true
            });
          }
          _this.collection.items.reset(response);
          if (options.success) return options.success(response);
        }
      });
    };

    Sync.prototype.incremental = function() {
      var _this = this;
      return this.pull({
        success: function() {
          return _this.push();
        }
      });
    };

    Sync.prototype.pull = function(options) {
      var _this = this;
      if (options == null) options = {};
      return Backbone.ajaxSync('read', this.collection.items, {
        success: function(response, status, xhr) {
          var item, _i, _len;
          _this.collection.destroyDiff(response);
          for (_i = 0, _len = response.length; _i < _len; _i++) {
            item = response[_i];
            _this.pullItem(item);
          }
          if (options.success) return options.success();
        }
      });
    };

    Sync.prototype.pullItem = function(item) {
      var local;
      local = this.collection.get(item.id);
      if (local) {
        return this.updateItem(item, local);
      } else {
        return this.createItem(item);
      }
    };

    Sync.prototype.createItem = function(item) {
      if (!_.include(this.storage.destroyIds.values, item.id.toString())) {
        item.sid = item.id;
        delete item.id;
        this.collection.items.create(item, {
          local: true
        });
        return this.collection.items.trigger('added');
      }
    };

    Sync.prototype.updateItem = function(item, model) {
      if ((new Date(model.get('updated_at'))) < (new Date(item.updated_at))) {
        delete item.id;
        model.save(item, {
          local: true
        });
        return model.trigger('updated');
      }
    };

    Sync.prototype.push = function() {
      var item, sid, _i, _j, _len, _len2, _ref, _ref2, _results;
      _ref = this.collection.dirty();
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        item = _ref[_i];
        this.pushItem(item);
      }
      _ref2 = this.storage.destroyIds.values;
      _results = [];
      for (_j = 0, _len2 = _ref2.length; _j < _len2; _j++) {
        sid = _ref2[_j];
        _results.push(this.destroyBySid(sid));
      }
      return _results;
    };

    Sync.prototype.pushItem = function(item) {
      var localId, method, _ref,
        _this = this;
      this.storage.replaceKeyFields(item, 'server');
      localId = item.id;
      delete item.attributes.id;
      _ref = item.get('sid') === 'new' ? ['create', null] : ['update', item.attributes.sid], method = _ref[0], item.id = _ref[1];
      Backbone.ajaxSync(method, item, {
        success: function(response, status, xhr) {
          if (method === 'create') {
            item.set({
              sid: response.id
            });
          }
          return item.save({
            dirty: false
          }, {
            local: true
          });
        }
      });
      item.attributes.id = localId;
      return item.id = localId;
    };

    Sync.prototype.destroyBySid = function(sid) {
      var model,
        _this = this;
      model = this.collection.fakeModel(sid);
      return Backbone.ajaxSync('delete', model, {
        success: function(response, status, xhr) {
          return _this.storage.destroyIds.remove(sid);
        }
      });
    };

    return Sync;

  })();

  Offline.Index = (function() {

    function Index(name) {
      var store;
      this.name = name;
      store = localStorage.getItem(this.name);
      this.values = (store && store.split(',')) || [];
    }

    Index.prototype.add = function(itemId) {
      if (!_.include(this.values, itemId.toString())) {
        this.values.push(itemId.toString());
      }
      return this.save();
    };

    Index.prototype.remove = function(itemId) {
      this.values = _.without(this.values, itemId.toString());
      return this.save();
    };

    Index.prototype.save = function() {
      return localStorage.setItem(this.name, this.values.join(','));
    };

    Index.prototype.reset = function() {
      this.values = [];
      return this.save();
    };

    return Index;

  })();

  Offline.Collection = (function() {

    function Collection(items) {
      this.items = items;
    }

    Collection.prototype.dirty = function() {
      return this.items.where({
        dirty: true
      });
    };

    Collection.prototype.get = function(sid) {
      return this.items.find(function(item) {
        return item.get('sid') === sid;
      });
    };

    Collection.prototype.destroyDiff = function(response) {
      var diff, sid, _i, _len, _ref, _results;
      diff = _.difference(_.without(this.items.pluck('sid'), 'new'), _.pluck(response, 'id'));
      _results = [];
      for (_i = 0, _len = diff.length; _i < _len; _i++) {
        sid = diff[_i];
        _results.push((_ref = this.get(sid)) != null ? _ref.destroy({
          local: true
        }) : void 0);
      }
      return _results;
    };

    Collection.prototype.fakeModel = function(sid) {
      var model;
      model = new Backbone.Model();
      model.id = sid;
      model.urlRoot = this.items.url;
      return model;
    };

    return Collection;

  })();

}).call(this);
