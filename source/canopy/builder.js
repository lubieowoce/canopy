Canopy.Builder = function(parent, name, parentName) {
  if (parent) {
    this._parent = parent;
    this._indentLevel = parent._indentLevel;
  } else {
    this._buffer = '';
    this._indentLevel = 0;
  }
  this._name = name;
  this._parentName = parentName;
  this._methodSeparator = '';
  this._varIndex = {};
};

Canopy.extend(Canopy.Builder.prototype, {
  serialize: function() {
    return this._buffer;
  },

  _write: function(string) {
    if (this._parent) return this._parent._write(string);
    this._buffer += string;
  },

  _quote: function(string) {
    string = string.replace(/\\/g, '\\\\')
                   .replace(/\x08/g, '\\b')
                   .replace(/\t/g, '\\t')
                   .replace(/\n/g, '\\n')
                   .replace(/\v/g, '\\v')
                   .replace(/\f/g, '\\f')
                   .replace(/\r/g, '\\r')
                   .replace(/'/g, "\\'");

    return "'" + string + "'";
  },

  package_: function(name, block, context) {
    this._write('(function() {');
    this.indent_(function(builder) {
      builder.line_("'use strict'");

      builder.newline_();
      builder.line_('var extend = ' + Canopy.extend.toString());
      builder.newline_();
      builder.line_('var formatError = ' + Canopy.formatError.toString());
      builder.newline_();
      builder.line_('var inherit = ' + Canopy.inherit.toString());
      builder.newline_();

      this._grammarName = name;
      block.call(context, this);
    }, this);
    this.newline_();
    this._write('})();');
    this.newline_();
  },

  syntaxNodeClass_: function() {
    var name = 'SyntaxNode';
    this.function_('var ' + name, ['textValue', 'offset', 'elements'], function(builder) {
      builder.line_('this.textValue = textValue');
      builder.line_('this.offset = offset');
      builder.line_('this.elements = elements || []');
    });
    this.function_(name + '.prototype.forEach', ['block', 'context'], function(builder) {
      builder.newline_();
      builder._write('for (var el = this.elements, i = 0, n = el.length; i < n; i++)');
      builder.indent_(function(builder) {
        builder.line_('block.call(context, el[i], i, el)');
      });
    });
    return name;
  },

  class_: function(name, parent, block, context) {
    var builder = new Canopy.Builder(this, name, parent);
    block.call(context, builder);
  },

  constructor_: function(args, block, context) {
    this.function_('var ' + this._name, args, function(builder) {
      builder.line_(this._parentName + '.apply(this, arguments)');
      block.call(context, builder);
    }, this);
    this._write('inherit(' + this._name + ', ' + this._parentName + ');');
    this.newline_();
  },

  attribute_: function(name, value) {
    this.assign_("this['" + name + "']", value);
  },

  arrayLookup_: function(expression, offset) {
    return expression + '[' + offset + ']';
  },

  indent_: function(block, context) {
    this._indentLevel += 1;
    block.call(context, this);
    this._indentLevel -= 1;
  },

  newline_: function() {
    this._write('\n');
    var i = this._indentLevel;
    while (i--) this._write('  ');
  },

  delimitField_: function() {
    this._write(this._methodSeparator);
    this._methodSeparator = ',\n';
  },

  line_: function(source) {
    this.newline_();
    this._write(source + ';');
  },

  offset_: function() {
    return 'this._offset';
  },

  chunk_: function(length) {
    var chunk = this.localVar_('chunk', this.null_()), input = 'this._input', of = 'this._offset';
    this.if_(input + '.length > ' + of, function(builder) {
      builder.line_(chunk + ' = ' + input + '.substring(' + of + ', ' + of + ' + ' + length + ')');
    });
    return chunk;
  },

  syntaxNode_: function(address, nodeType, expression, bump, elements, nodeClass) {
    elements = ', ' + (elements || '[]');

    var klass = nodeClass || 'SyntaxNode',
        of    = ', this._offset';

    this.line_(address + ' = new ' + klass + '(' + expression + of + elements + ')');
    this.extendNode_(address, nodeType);
    this.line_('this._offset += ' + bump);
  },

  extendNode_: function(address, nodeType) {
    if (!nodeType) return;
    this.line_('extend(' + address + ', this.constructor.' + nodeType + ')');
  },

  failure_: function(address, expected) {
    this.assign_(address, this.null_());
    var input = 'this._input', of = 'this._offset';
    var error = 'this.error = this.constructor.lastError';
    this.if_('!this.error || this.error.offset <= ' + of, function(builder) {
      builder.line_(error + ' = {input: ' + input +
                              ', offset: ' + of +
                              ', expected: ' + builder._quote(expected) + '}');
    });
  },

  namespace_: function(objectName) {
  },

  function_: function(name, args, block, context) {
    this.newline_();
    this._write(name + ' = function(' + args.join(', ') + ') {');
    new Canopy.Builder(this, this._name, this._parentName).indent_(block, context);
    this.newline_();
    this._write('};');
    this.newline_();
  },

  grammarModule_: function(block, context) {
    this.newline_();
    this._write('var Grammar = {');
    new Canopy.Builder(this).indent_(block, context);
    this.newline_();
    this._write('};');
    this.newline_();
  },

  parserClass_: function(root) {
    this.function_('var Parser', ['input'], function(builder) {
      builder.assign_('this._input', 'input');
      builder.assign_('this._offset', '0');
      builder.assign_('this._cache', '{}');
    });
    this.function_('Parser.prototype.parse', [], function(builder) {
      var input = 'this._input', of = 'this._offset';

      builder.line_('var result = this._read_' + root + '()');

      builder.if_('result && this._offset === this._input.length', function(builder) {
        builder.return_('result');
      });
      builder.unless_('this.error', function(builder) {
        builder.line_('this.error = {input: this._input, offset: this._offset, expected: "<EOF>"}');
      });
      builder.line_('throw new Error(formatError(this.error))');
    });
    this.function_('Parser.parse', ['input'], function(builder) {
      builder.line_('var parser = new Parser(input)');
      builder.return_('parser.parse()');
    });
    this.line_('extend(Parser.prototype, Grammar)');
    this.newline_();
  },

  exports_: function() {
    var grammar   = this._grammarName,
        namespace = /\./.test(grammar) ? grammar.replace(/\.[^\.]+$/g, '').split('.') : [],
        n         = namespace.length,
        last      = namespace[n - 1],
        condition = [];

    for (var i = 0; i < n; i++)
      condition.push('typeof ' + namespace.slice(0,i+1).join('.') + " !== 'undefined'");

    this.assign_('var exported', '{Grammar: Grammar, Parser: Parser, parse: Parser.parse, formatError: formatError}');
    this.newline_();

    this.if_("typeof require === 'function' && typeof exports === 'object'", function(builder) {
      builder.line_('extend(exports, exported)');
      if (condition.length > 0) builder.if_(condition.join(' &&' ), function(builder) {
        builder.assign_(grammar, 'exported');
      });
    }, function(builder) {
      if (n > 0) {
        builder.assign_('var namespace', 'this');
        for (var i = 0, n = namespace.length; i < n - 1; i++)
          builder.assign_('namespace', 'namespace.' + namespace[i] + ' = namespace.' + namespace[i] + ' || {}');
      }
      builder.assign_(grammar, 'exported');
    });
  },

  field_: function(name, value) {
    this.delimitField_();
    this.newline_();
    this._write(name + ': ' + value);
  },

  method_: function(name, args, block, context) {
    this.delimitField_();
    this.newline_();
    this._write(name + ': function(' + args.join(', ') + ') {');
    new Canopy.Builder(this).indent_(block, context);
    this.newline_();
    this._write('}');
  },

  cache_: function(name, block, context) {
    var temp      = this.localVars_({address: this.null_(), index: 'this._offset'}),
        address   = temp.address,
        offset    = temp.index,
        cacheMap  = 'this._cache._' + name,
        cacheAddr = cacheMap + '[' + offset + ']';

    this.assign_(cacheMap, cacheMap + ' || {}');
    this.line_('var cached = ' + cacheAddr);

    this.if_('cached', function(builder) {
      builder.line_('this._offset += cached.textValue.length');
      builder.return_('cached');
    }, this);

    block.call(context, this, address);
    this.return_(cacheAddr + ' = ' + address);
  },

  assign_: function(name, value) {
    this.line_(name + ' = ' + value);
  },

  jump_: function(address, rule) {
    this.assign_(address, 'this._read_' + rule + '()');
  },

  ivar_: function(name, value) {
    this.assign_('this._' + name, value);
  },

  localVar_: function(name, value) {
    this._varIndex[name] = this._varIndex[name] || 0;
    var varName = name + this._varIndex[name];
    this._varIndex[name] += 1;
    this.assign_('var ' + varName, (value === undefined) ? this.null_(): value);
    return varName;
  },

  localVars_: function(vars) {
    var names = {}, code = [], varName;
    for (var name in vars) {
      this._varIndex[name] = this._varIndex[name] || 0;
      varName = name + this._varIndex[name];
      this._varIndex[name] += 1;
      code.push(varName + ' = ' + vars[name]);
      names[name] = varName;
    }
    this.line_('var ' + code.join(', '));
    return names;
  },

  conditional_: function(kwd, condition, block, context) {
    this.newline_();
    this._write(kwd + ' (' + condition + ') {');
    this.indent_(block, context);
    this.newline_();
    this._write('}');
  },

  for_: function(condition, block, context) {
    this.conditional_('for', condition, block, context);
  },

  while_: function(condition, block, context) {
    this.conditional_('while', condition, block, context);
  },

  if_: function(condition, block, else_, context) {
    if (typeof else_ !== 'function') {
      context = else_;
      else_   = null;
    }
    this.conditional_('if', condition, block, context);
    if (!else_) return;
    this._write(' else {');
    this.indent_(else_, context);
    this.newline_();
    this._write('}');
  },

  unless_: function(condition, block, else_, context) {
    this.if_('!' + condition, block, else_, context);
  },

  return_: function(expression) {
    this.line_('return ' + expression);
  },

  append_: function(list, value) {
    this.line_(list + '.push(' + value + ')');
  },

  concatText_: function(buffer, value) {
    this.line_(buffer + ' += ' + value + '.textValue');
  },

  decrement_: function(variable) {
    this.line_('--' + variable);
  },

  and_: function(left, right) {
    return left + ' && ' + right;
  },

  regexMatch_: function(regex, expression) {
    return '/' + regex.source + '/.test(' + expression + ')';
  },

  stringMatch_: function(expression, string) {
    return expression + ' === ' + this._quote(string);
  },

  stringMatchCI_: function(expression, string) {
    return expression + '.toLowerCase() === ' + this._quote(string) + '.toLowerCase()';
  },

  stringLength_: function(expression) {
    return expression + '.length';
  },

  isZero_: function(expression) {
    return expression + ' <= 0';
  },

  isNull_: function(expression) {
    return expression + ' === ' + this.null_();
  },

  emptyList_: function() {
    return '[]';
  },

  emptyString_: function() {
    return "''";
  },

  true_: function() {
    return 'true';
  },

  null_: function() {
    return 'null';
  }
});
