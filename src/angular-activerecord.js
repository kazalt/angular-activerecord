/**
 * @licence ActiveRecord for AngularJS
 * (c) 2013-2014 Bob Fanger, Jeremy Ashkenas, DocumentCloud
 * License: MIT
 */
angular.module('ActiveRecord', []).factory('ActiveRecord', ['$http', '$q', '$parse', '$injector', function($http, $q, $parse, $injector) {
	'use strict';

	/**
	 * If the value of the named property is a function then invoke it; otherwise, return it.
	 * @param {Object} object
	 * @param {String} property
	 * @ignore
	 */
	var _result = function (object, property) {
		if (object == null) return null;
		var value = object[property];
		return angular.isFunction(value) ? value.call(object) : value;
	};

	var _ucfirst = function(string) {
		return string.charAt(0).toUpperCase() + string.slice(1);
	};

	var _lcfirst = function(string) {
		return string.charAt(0).toLowerCase() + string.slice(1);
	};

	/**
	 * Apply the filters to the properties.
	 *
	 * @param {Object|null} filters The $readFilters or $writeFilters.
	 * @param {Object} properties
	 * @ignore
	 */
	var applyFilters = function (filters, properties) {
		if (filters) {
			angular.forEach(filters, function (filter, path) {
				var expression = $parse(path);
				var value = expression(properties);
				if (angular.isDefined(value)) {
					var newValue = (angular.isFunction(filter)) ? filter(value) : $parse(path + '|' + filter)(properties);
					expression.assign(properties, newValue);
				}
			});
		}
	};

	/**
	 * @class ActiveRecord  ActiveRecord for AngularJS
	 * @constructor
	 * @param {Object} [properties]  Initialize the record with these property values.
	 * @param {Object} [options]
	 */
	var ActiveRecord = function ActiveRecord(properties, options) {
		this.$initialize.apply(this, arguments);
	};
	ActiveRecord.prototype = {

		/**
		 * @property {String} $idAttribute  The default name for the JSON id attribute is "id".
		 */
		$idAttribute: 'id',

		/**
		 * @property {String} $urlRoot  Used by $url to generate URLs based on the model id. "[urlRoot]/id"
		 */
		$urlRoot: null,

		/**
		 * Constructor logic
		 * (which is called by the autogenerated constructor via ActiveRecord.extend)
		 * @param {Object} [properties]  Initialize the record with these property values.
		 * @param {Object} [options]
		 */
		$initialize: function (properties, options) {
			options = options || {};
			var defaults = _result(this, '$defaults');
			if (defaults) {
				angular.extend(this, defaults);
			}
			if (properties) {
				if (options.parse) {
					properties = this.$parse(properties);
				}
				if (options.readFilters) {
					applyFilters(_result(this, '$readFilters'), properties);
				}
				angular.extend(this, properties);
				this.$previousAttributes = function () {
					return properties;
				};
			}
			if (options.url) {
				this.$url = options.url;
			}
			if (options.urlRoot) {
				this.$urlRoot = options.urlRoot;
			}
		},

		/**
		 * Determine if the model has changed since the last sync (fetch/load).
		 *
		 * @param {String} [property] Determine if that specific property has changed.
		 * @returns {Boolean}
		 */
		$hasChanged: function (property) {
			var changed = this.$changedAttributes();
			if (property) {
				return property in changed;
			}
			for (var i in changed) {
				return true;
			}
			return false;
		},

		/**
		 * Return an object containing all the properties that have changed.
		 * Removed properties will be set to undefined.
		 *
		 * @param {Object} [diff] An object to diff against, determining if there would be a change.
		 * @returns {Object}
		 */
		$changedAttributes: function (diff) {
			var current = diff || this; // By default diff against the current values
			var changed = {};
			var previousAttributes = this.$previousAttributes();
			if (!diff) { // Skip removed properties (only compare the properties in the diff object)
				for (var property in previousAttributes) {
					if (typeof current[property] === 'undefined') {
						changed[property] = current[property];
					}
				}
			}
			for (var property in current) {
				if (current.hasOwnProperty(property) && property.indexOf("$") !== 0) {
					var value = current[property];
					if (typeof value !== 'function' && angular.equals(value, previousAttributes[property]) === false) {
						changed[property] = value;
					}
				}
			}
			return changed;
		},

		/**
		 * Get the previous value of a property.
		 * @param {String} [property]
		 */
		$previous: function (property) {
			var previousAttributes = this.$previousAttributes();
			if (property == null || !previousAttributes) {
				return null;
			}
			return previousAttributes[property];
		},

		/**
		 * Get all of the properties of the model at the time of the previous sync (fetch/save).
		 * @returns {Object}
		 */
		$previousAttributes: function () {
			return {};
		},

		$toCamelCase: function(string) {
			var camelCase = string.replace (/(?:^|[-_])(\w)/g, function (_, c) {
				return c ? c.toUpperCase () : '';
			});
			return camelCase;
		},

		$computeData: function(data) {
			var model = this;
			angular.forEach(data, function(value, key) {
				var camelCaseKey = model.$toCamelCase(key);
				var lowerCaseKey = camelCaseKey.toLowerCase();
				var assocName = null;
				var module = null;
				angular.forEach(model.$associations, function(valueAssoc, keyAssoc) {
					if (lowerCaseKey == keyAssoc.toLowerCase()) {
						assocName = keyAssoc;
					} else if (valueAssoc.options.through && lowerCaseKey == valueAssoc.options.through.toLowerCase()) {
						assocName = valueAssoc.options.through;
					} else if (valueAssoc.options.singular && valueAssoc.options.singular.toLowerCase() == lowerCaseKey) {
						module = keyAssoc;
						assocName = valueAssoc.options.singular;
					}
				});
				if (assocName) {
					if (!module) module = assocName;
					var lowerCamelCaseKey = _lcfirst(assocName);
					var AssocModel = $injector.get(module);
					if (angular.isArray(value)) {
						model["$" + lowerCamelCaseKey] = [];
						angular.forEach(value, function(v) {
							var assocModel = new AssocModel();
							assocModel.$computeData(v);
							model["$" + lowerCamelCaseKey].push(assocModel);
						});
					} else {
						var assocModel = new AssocModel();
						assocModel.$computeData(value);
						model["$" + lowerCamelCaseKey] = assocModel;
					}
				} else {
					model[key] = value;
				}
			});
			return model;
		},

		/**
		 * (re)load data from the backend.
		 * @param {Object} [options] sync options
		 * @return $q.promise
		 */
		$fetch: function (options) {
			var model = this;
			var deferred = $q.defer();
			this.$sync('read', this, options).then(function (response) {
				var data = model.$parse(response.data, options);
				if (angular.isObject(data)) {
					applyFilters(_result(model, '$readFilters'), data);
					model.$computeData(data);
					data = angular.copy(model);
					model.$previousAttributes = function () {
						return data;
					};
					deferred.resolve(model);
				} else {
					deferred.reject('Not a valid response type');
				}
			}, deferred.reject);
			return deferred.promise;
		},

		$validationErrorMessages: {},

		$validations: {},

		$fieldTranslations: {},

		$errors: {},

		$isValid: function(fieldName) {
			var valid = false;
			if (Object.keys(this.$errors).length === 0) {
				valid = true;
			} else if (fieldName && !this.$errors[fieldName]) {
				valid = true;
			}
			return valid;
		},

		$validateOne: function(fieldName) {
			var errors = [];
			delete this.$errors[fieldName];
			if (this.$validations[fieldName]) {
				var mthis = this;
				if (mthis[fieldName]) {
					angular.forEach(this.$validations[fieldName], function(validationValue, functionName) {
						var $functionName = "$" + functionName;
						if (functionName != "required" && mthis[$functionName]) {
							var value = validationValue;
							var errorMessage = null;
							if (angular.isObject(validationValue)) {
								if (validationValue.value) value = validationValue.value;
								if (validationValue.message) errorMessage = validationValue.message;
							}
							var res = mthis[$functionName](mthis[fieldName], value);
							if (res !== true) {
								if (!errorMessage) errorMessage = mthis.$validationErrorMessages[functionName] || "is invalid";
								if (angular.isFunction(errorMessage)) errorMessage = errorMessage(fieldName, mthis[fieldName], value);
								if (typeof sprintf !== "undefined") {
									errorMessage = sprintf(errorMessage, {fieldName: mthis.$fieldTranslations[fieldName] || fieldName, fieldValue: mthis[fieldName], validationValue: value});
								}
								errors.push(errorMessage);
							}
						}
					});
				} else if (this.$validations[fieldName].required) {
					var errMessage = null;
					if (angular.isObject(this.$validations[fieldName].required) && this.$validations[fieldName].required.message) {
						errMessage = this.$validations[fieldName].required.message;
					} else if (this.$validationErrorMessages.required) {
						errMessage = this.$validationErrorMessages.required;
					} else {
						errMessage = "is required";
					}
					if (angular.isFunction(errMessage)) errMessage = errMessage(fieldName); 
					errors.push(errMessage);
				}
			}
			if (errors.length) {
				this.$errors[fieldName] = errors;
			}
			return this.$isValid(fieldName);
		},

		$validate: function(fieldName) {
			if (fieldName) return this.$validateOne(fieldName);

			var mthis = this;
			this.$errors = {};
			angular.forEach(this.$validations, function(validation, validationKey) {
				mthis.$validateOne(validationKey);
			});
			return this.$isValid();
		},

		$saveBelongsToAssociations: function(values, options, deferred) {
			var model = this;
			// we want to save associations before.. so we need some callback stuff
			var nbrLeft = 0;
			var nbrFound = 0;
			var err = false;
			var assocsaveCallbackContainer = function(assoc) {
				return function() {
					if (err) return;
					if (assoc.$isNew()) {
						err = true;
						return deferred.reject();
					}
					nbrLeft--;
					if (nbrLeft === 0) {
						model.$save(values, options).then(function(model) {
							deferred.resolve(model);
						}).catch(function(err) {
							deferred.reject(err);
						});
					}
				};
			};
			// get all associations data and save them if needed
			angular.forEach(this.$associations, function(assocObj, assocKey) {
				var keyName = assocKey;
				if (assocObj.options.singular) keyName = assocObj.options.singular;
				keyName = _lcfirst(keyName);
				var assoc = model["$" + keyName];
				if (assoc && assocObj.type == "belongsTo") {
					if (assoc.$isNew()) {
						nbrFound++;
						nbrLeft++;
						assoc.$save().then(
							assocsaveCallbackContainer(assoc)
						).catch(function(error) {
							err = true;
							deferred.reject(error);
						});
					} else {
						model[assocObj.options.key] = assoc.id;
					}
				}
			});

			return nbrFound;
		},

		$saveHasManyAssociations: function(deferred) {
			var model = this;
			var nbrLeft = 0;
			var nbrFound = 0;
			var err = false;

			var assocsaveCallbackContainer = function(assoc) {
				return function() {
					if (err) return;
					if (assoc.$isNew()) {
						err = true;
						return deferred.reject();
					}
					nbrLeft--;
					if (nbrLeft === 0) {
						deferred.resolve(model);
					}
				};
			};
			angular.forEach(this.$associations, function(assocObj, assocKey) {
				var keyName = assocKey;
				if (assocObj.options.through) keyName = assocObj.options.through;
				keyName = _lcfirst(keyName);
				var assocs = model["$" + keyName];
				if (assocs && assocObj.type == "hasMany") {
					angular.forEach(assocs, function(assoc) {
						if (assoc.$isNew() || assoc.$changedAttributes()) {
							nbrFound++;
							nbrLeft++;
							assoc[assoc.$associations[model.$name].options.key] = model.id;
							assoc.$save().then(
								assocsaveCallbackContainer(assoc)
							).catch(function(error) {
								err = true;
								deferred.reject(error);
							});
						}
					});
				}
			});

			return nbrFound;
		},

		/**
		 * Save the record to the backend.
		 * @param {Object} [values] Set these values before saving the record.
		 * @param {Object} [options] sync options
		 * @return $q.promise
		 */
		$save: function (values, options) {
			if (values) {
				if (angular.isString(values)) {
					values = {};
					values[arguments[0]] = options;
					options = arguments[2];
				}
				angular.extend(this, values);
			}
			var operation = this.$isNew() ? 'create' : 'update';
			var model = this;
			if (!model.$validate()) {
				var deferred = $q.defer();
				deferred.reject(model.$errors);
				return deferred.promise;
			}
			options = options || {};
			var filters = _result(this, '$writeFilters');
			//if we have found some associations not already saved, we need to wait for our callback to be called
			var deferred = $q.defer();
			if (this.$saveBelongsToAssociations(values, options, deferred)) {
				return deferred.promise;
			}
			var data = this.$isNew() ? this : this.$changedAttributes();
			if (filters) {
				options.data = angular.copy(data);
				applyFilters(filters, options.data);
			} else {
				options.data = angular.copy(data);
			}
			this.$sync(operation, this, options).then(function (response) {
				var data = model.$parse(response.data, options);
				if (angular.isObject(data)) {
					applyFilters(_result(model, '$readFilters'), data);
					angular.extend(model, data);
					model.$previousAttributes = function () {
						return data;
					};
				}
				if (!model.$saveHasManyAssociations(deferred)) deferred.resolve(model);
			}).catch(function(err) {
				deferred.reject(err);
			});
			return deferred.promise;
		},

		/**
		 * Destroy this model on the server if it was already persisted.
		 * @param {Object} [options] sync options
		 * @return $q.promise
		 */
		$destroy: function (options) {
			var deferred = $q.defer();
			if (this.$isNew()) {
				deferred.resolve();
				return deferred.promise;
			}
			this.$sync('delete', this, options).then(function () {
				deferred.resolve();
			}, deferred.reject);
			return deferred.promise;
		},

		/**
		 * Generate the url for the $save, $fetch and $destroy methods.
		 * @return {String} url
		 */
		$url: function() {
			var urlRoot = _result(this, '$urlRoot');
			var urlRessource = _result(this, '$urlRessource');
			if (urlRessource) urlRoot += urlRessource;
			if (typeof this[this.$idAttribute] === 'undefined') {
				return urlRoot;
			}
			if (urlRoot === null) {
				throw 'Implement this.$url() or specify this.$urlRoot';
			}
			return urlRoot + (urlRoot.charAt(urlRoot.length - 1) === '/' ? '' : '/') + encodeURIComponent(this[this.$idAttribute]);
		},

		/**
		 * Process the data from the response and return the record-properties.
		 * @param {Object} data  The data from the sync response.
		 * @param {Object} [options] sync options
		 * @return {Object}
		 */
		$parse: function (data, options) {
			return data;
		},

		/**
		 * Process the record-properties and return the data for the resquest. (counterpart of $parse)
		 * Called automaticly by JSON.stringify: @link https://developer.mozilla.org/en-US/docs/JSON#toJSON()_method
		 */
		toJSON: function() {
			return this;
		},

		/**
		 * @property {Object} $readFilters
		 * Preform post-processing on the properties after $parse() through angular filters.
		 * These could be done in $parse(), but $readFilters enables a more reusable and declarative way.
		 */
		$readFilters: null,

		/**
		 * @property {Object} $writeFilters
		 * Preform pre-processing on the properties before $save() through angular filters.
		 * These could be done in toJSON(), but $readFilters enables a more reusable and declarative way.
		 */
		$writeFilters: null,

		/**
		 * A model is new if it lacks an id.
		 */
		$isNew: function () {
			return this[this.$idAttribute] == null;
		},

		/**
		 * By default calls ActiveRecord.sync
		 * Override to change the backend implementation on a per model bases.
		 * @param {String} operation  "create", "read", "update" or "delete"
		 * @param {ActiveRecord} model
		 * @param {Object} options
		 * @return $q.promise
		 */
		$sync: function (operation, model, options) {
			return ActiveRecord.sync.apply(this, arguments);
		}
	};

	/**
	 * Preform a CRUD operation on the backend.
	 *
	 * @static
	 * @param {String} operation  "create", "read", "update" or "delete"
	 * @param {ActiveRecord} model
	 * @param {Object} options
	 * @return $q.promise
	 */
	ActiveRecord.sync = function (operation, model, options) {
		if (typeof options === 'undefined') {
			options = {};
		}
		if (!options.method) {
			var crudMapping = {
				create: 'POST',
				read: 'GET',
				update: 'PUT',
				"delete": 'DELETE'
			};
			options.method = crudMapping[operation];
		}
		if (!options.url) {
			options.url = _result(model, '$url');
		}
		return $http(options);
	};

	/**
	 * Create a subclass.
	 * @static
	 * @param {Object} protoProps
	 * @param {Object} [staticProps]
	 * @return {Function} Constructor
	 */
	ActiveRecord.extend = function(protoProps, staticProps) {
		var parent = this;
		var child;

		if (protoProps && typeof protoProps.$constructor === 'function') {
			child = protoProps.$constructor;
		} else {
			child = function () { return parent.apply(this, arguments); };
		}
		angular.extend(child, parent, staticProps);
		var Surrogate = function () { this.$constructor = child; };
		Surrogate.prototype = parent.prototype;
		child.prototype = new Surrogate();
		if (protoProps) {
			angular.extend(child.prototype, protoProps);
		}
		child.__super__ = parent.prototype;
		child.prototype.$associations = {};
		return child;
	};

	ActiveRecord.hasMany = function(entity, options) {
		if (!options) options = {};
		if ($injector.has(entity)) {
			var mthis = this;
			var name = _lcfirst(entity);
			var relatedName = _lcfirst(options.through);
			this.prototype.$associations[entity] = {type: "hasMany", options: options};
			this.prototype["add" + entity] = function(model, relatedData) {
				var options = this.$associations[entity].options;
				if (!relatedData) relatedData = {};
				if (!this["$" + relatedName]) this["$" + relatedName] = [];
				var RelatedModel = $injector.get(options.through);
				var newEntity = new RelatedModel(relatedData);
				var entityName = entity;
				if (newEntity.$associations[entity].options.singular) {
					entityName = _ucfirst(newEntity.$associations[entity].options.singular);
				}
				newEntity["add" + entityName](model);
				this["$" + relatedName].push(newEntity);
				return model;
			};
		}
	};

	ActiveRecord.belongsTo = function(entity, options) {
		if (!options) options = {};
		if ($injector.has(entity)) {
			var name = _lcfirst(options.singular || entity);
			this.prototype.$associations[entity] = {type: "belongsTo", options: options};
			var functionName = options.singular? _ucfirst(options.singular) : entity;
			this.prototype["add" + functionName] = function(model) {
				this["$" + name] = model;
				return model;
			};
		}
	};

	/**
	 * Load a single record.
	 *
	 * @static
	 * @param {Mixed} id
	 * @param {Object} [options]
	 * @return $q.promise
	 */
	ActiveRecord.fetchOne = function (id, options) {
		var model = new this();
		model[model.$idAttribute] = id;
		return model.$fetch(options);
	};

	/**
	 * Load a collection of records.
	 *
	 * @static
	 * @param {Object} [options]
	 * @return $q.promise
	 */
	ActiveRecord.fetchAll = function (options) {
		var ModelType = this;
		var model = new ModelType();
		var deferred = $q.defer();
		model.$sync('read', model, options).then(function (response) {
			var data = model.$parse(response.data, options);
			if (angular.isArray(data)) {
				var models = [];
				var filters = ModelType.prototype.$readFilters;
				angular.forEach(data, function (item) {
					applyFilters(filters, item);
					models.push(new ModelType(item));
				});
				deferred.resolve(models);
			} else {
				deferred.reject('Not a valid response, expecting an array');
			}
		}, deferred.reject);
		return deferred.promise;
	};
	return ActiveRecord;
}]);