/*******************************************************************************
 * @license
 * Copyright (c) 2009, 2011 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials are made 
 * available under the terms of the Eclipse Public License v1.0 
 * (http://www.eclipse.org/legal/epl-v10.html), and the Eclipse Distribution 
 * License v1.0 (http://www.eclipse.org/org/documents/edl-v10.html). 
 * 
 * Contributors: IBM Corporation - initial API and implementation
 ******************************************************************************/

define([], function(){

	/**
	 * InputCompletion is an alternative to datalist support in html5.
	 * When binded with an html input element, it provides the input completion while user is typing in the input field.
	 * @param {DOMElement} inputFieldOrId The "text" type input html element. This is required.
	 * @param {function} binderFunc The callback function to provide a full set of proposal items that the proposal is based on.
	 * If a binder function is provided, every time when the input field is focused, we would ask for the full set of data and propose based on that.	 
	 * The parameter of the binderFunc is another call back function. The implementation of the binderFunc has to pass an array of 
	 * items to the call back.
	 * Each item must have 3 properties:
	 * <ul>
	 *   <li>type: can be either "proposal" or "category"</li>
	 *   <li>label: the display name of the item</li>
	 *   <li>value: the value that will be filtered on and send back to the input field</li>
	 * </ul>
	 *
	 * @param {Object} options The options that may affect how the proposal works.
	 * @param {String} options.group The group name of input completion. If there will be multiple input completion in one page, the group name is nice to provide.
	 * @param {Boolean} options.proposeFromStart The flag to propose strings that only match from start(index 0). If not provided, the flag is set to false.
	 * For example if this flag is true, "foo" will only match "fo" but not "oo". If false, "foo" will match both "fo" and "oo".
	 */
	function InputCompletion(inputFieldOrId, binderFunc, options) {
		this._inputField = inputFieldOrId;
		if (typeof(this._inputField) === "string") { //$NON-NLS-0$
			this._inputField = document.getElementById(this._inputField);
		}
		this._binderFunc = binderFunc;
		var idFrefix = options ? options.group: null;
		if(!idFrefix){
			if(this._inputField.id){
				idFrefix = this._inputField.id;
			} else {
				idFrefix = "default__input__group"; //$NON-NLS-0$
			}
		}
		this._completionIdPrefix = idFrefix + "__completion__"; //$NON-NLS-0$
		this._proposeFromStart = options ? options.proposeFromStart : false;
		this._proposalIndex = -1;
		this._dismissed = true;
		this._mouseDown = false;
		this._initUI();
		
		var that = this;
		this._completionUIContainer.onmousedown = function(e){
			that._mouseDown = true;
		};
		this._completionUIContainer.onmouseup = function(e){
			that._mouseDown = false;
		};
		this._inputField.onblur = function(e){
			if(that._mouseDown){
				window.setTimeout(function(){ //wait a few milliseconds for the input field to focus 
					that._inputField.focus();
				}, 200);
			} else {
				that._dismiss();
			}
		};
		this._inputField.oninput = function(e){
			that._proposeOn(that._inputField.value);
		};
		this._inputField.onfocus = function(e){
			if(!that._dismissed || !that._binderFunc){
				return;
			}
			if(that._dismissing){
				that._dismissing = false;
				return;
			}
			if(that._binderFunc){// If a binder function is provided, every time when the input field is focused, we would ask for the full set of data and propose based on that
				that._binderFunc(function(dataList){
					that._bind(dataList);
					that._proposeOn(that._inputField.value);
				});
			}
		};
	}
	
	/**
	 * The key listener on enter , down&up arrow and ESC keys.
	 * The user of the input completion has to listen on the key board events and call this function.
	 * If this function returns true, the caller's listener has to stop handling it.
	 */
	InputCompletion.prototype.onKeyPressed = function(e){
		if (e.charOrCode === 13/* Enter */) {//If there is already a selected/hightlighted item in the proposal list, then put hte proposal back to the input field and dismiss the proposal UI
			if(this._proposalList && this._proposalList.length > 0 && this._proposalIndex >= 0 && this._proposalIndex < this._proposalList.length){
				this._dismiss(this._proposalList[this._proposalIndex].item.value);
				return true;
			}
			return false;
		} else if((e.charOrCode === 40 /* Down arrow */ || e.charOrCode === 38 /* Up arrow */) && this._proposalList && this._proposalList.length > 0){
			this._walk(e.charOrCode === 40);//In case of down or up arrows, jsut walk forward or backward in the list and highlight it.
			return true;
		} else if(e.charOrCode === 27/* ESC */) {
			this._dismiss();//Dismiss the proposal UI and do nothing.
		}
		return false;
	};

	InputCompletion.prototype._bind = function(dataList){
		this._dataList = dataList;
	};
	
	InputCompletion.prototype._getUIContainerID = function(){
		return this._completionIdPrefix + "UIContainer";
	};

	InputCompletion.prototype._getUIProposalListId = function(){
		return this._completionIdPrefix + "UIProposalList";
	};
	
	InputCompletion.prototype._initUI = function(){
		this._completionUIContainer = document.getElementById(this._getUIContainerID());
		if(!this._completionUIContainer){
			this._completionUIContainer = document.createElement('div');
			this._completionUIContainer.id = this._getUIContainerID();
			this._completionUIContainer.style.display = "none"; //$NON-NLS-0$
			this._completionUIContainer.className = "inputCompletionContainer"; //$NON-NLS-0$
			this._completionUIContainer.setAttribute("role", "list");
			this._completionUIContainer.setAttribute("aria-atomic", "true");
			this._completionUIContainer.setAttribute("aria-live", "assertive");
			document.body.appendChild(this._completionUIContainer);
		}
		this._completionUIContainer.innerHTML = "";
		this._completionUL = document.getElementById(this._getUIProposalListId())
		if(!this._completionUL){
			this._completionUL = document.createElement('ul');//$NON-NLS-0$
			this._completionUL.id = this._getUIProposalListId();
			this._completionUL.className = "inputCompletionUL";//$NON-NLS-0$
		}
		this._completionUL.innerHTML = "";
		this._completionUIContainer.appendChild(this._completionUL);
	};
	
	InputCompletion.prototype._proposeOnCategory = function(categoryName, categoryList){
		if(categoryList.length === 0){
			return;
		}
		var that = this;
		if(categoryName){
			var listEle = document.createElement('li');
			listEle.className = "inputCompletionLICategory"; //$NON-NLS-0$
 			var liText = document.createTextNode(categoryName);
			listEle.appendChild(liText);
 			this._completionUL.appendChild(listEle);
		}
		for(var i=0; i < categoryList.length; i++){
			var listEle = document.createElement('li');
			listEle.onmouseover = function(e){
				that._selectProposal(e.currentTarget);
			};
			listEle.onclick = function(e){
				that._dismiss(e.currentTarget.completionItem.value);
			};
			listEle.className = "inputCompletionLINormal"; //$NON-NLS-0$
			listEle.completionItem = categoryList[i];
 			var liText = document.createTextNode(categoryList[i].value);
			listEle.appendChild(liText);
 			this._completionUL.appendChild(listEle);
 			this._proposalList.push({item: categoryList[i], domNode: listEle});
		}
	};

	InputCompletion.prototype._domNode2Index = function(domNode){
		for(var i=0; i < this._proposalList.length; i++){
			if(this._proposalList[i].domNode === domNode){
				return i;
			}
		}
		return -1;
	};
	
	InputCompletion.prototype._highlight = function(indexOrDomNode, selected){
		var domNode = indexOrDomNode;
		var fromIndex = false;
		if(!isNaN(domNode)){
			fromIndex = true;
			if(this._proposalList && indexOrDomNode >= 0 && indexOrDomNode < this._proposalList.length){
				domNode = this._proposalList[indexOrDomNode].domNode;
			} else {
				domNode = null;
			}
		}
		if(domNode){
			domNode.className = (selected ? "inputCompletionLISelected": "inputCompletionLINormal"); //$NON-NLS-0$ //$NON-NLS-0$
			if(selected && fromIndex){
				if (domNode.offsetTop < this._completionUIContainer.scrollTop) {
					domNode.scrollIntoView(true);
				} else if ((domNode.offsetTop + domNode.offsetHeight) > (this._completionUIContainer.scrollTop + this._completionUIContainer.clientHeight)) {
					domNode.scrollIntoView(false);
				}
			}
		}
	};

	InputCompletion.prototype._selectProposal = function(indexOrDomNode){
		var index = indexOrDomNode;
		if(isNaN(index)){
			index = this._domNode2Index(indexOrDomNode);
		}
		if(index !== this._proposalIndex){
			this._highlight(this._proposalIndex, false);
			this._proposalIndex = index;
			this._highlight(this._proposalIndex, true);
		}
	};
	
	InputCompletion.prototype._dismiss = function(valueToInputField){
		if(this._mouseDown){
			return;
		}
		this._dismissed = true;
		this._proposalList = null;
		this._proposalIndex = -1;
		if(valueToInputField){
			this._inputField.value = valueToInputField;
			this._dismissing = true;
			this._inputField.focus();
		}
		var that = this;
		window.setTimeout(function(){ //wait a few milliseconds for the proposal pane to hide 
			that._completionUIContainer.style.display = "none"; //$NON-NLS-0$
		}, 200);
	};
	
	InputCompletion.prototype._show = function(){
		if(this._proposalList && this._proposalList.length > 0){
			this._completionUIContainer.style.display = "block"; //$NON-NLS-0$
			this._completionUIContainer.style.top = this._inputField.offsetTop + this._inputField.offsetHeight + 2 + "px"; //$NON-NLS-0$
			this._completionUIContainer.style.left = this._inputField.offsetLeft + "px"; //$NON-NLS-0$
			this._completionUIContainer.style.width = this._inputField.offsetWidth + "px"; //$NON-NLS-0$
			this._mouseDown = false;
			this.dismissed = false;
		} else {
			this._dismissed = true;
			this._proposalList = null;
			this._proposalIndex = -1;
			this._completionUIContainer.style.display = "none"; //$NON-NLS-0$
		}
	};
	
	InputCompletion.prototype._walk = function(forwad){
		var index = this._proposalIndex + (forwad ? 1: -1);
		if(index < -1){
			index = this._proposalList.length -1;
		} else if( index >= this._proposalList.length){
			index = -1;
		}
		this._selectProposal(index);
	}
	
	InputCompletion.prototype._proposeOn = function(inputValue){
		if(!this._dataList){
			return;
		}
		this._completionUL.innerHTML = "";
		var searchTerm = inputValue ? inputValue.toLowerCase() : null;
		this._proposalList = [];
		var categoryName = "";
		var categoryList = [];
		for(var i=0; i < this._dataList.length; i++){
			if(this._dataList[i].type === "category"){ //$NON-NLS-0$
				this._proposeOnCategory(categoryName, categoryList);
				categoryName = this._dataList[i].label;
				categoryList = [];
			} else {
				var proposed = true;
				if(searchTerm){
					var searchOn = this._dataList[i].value.toLowerCase();
					var pIndex = searchOn.indexOf(searchTerm);
					if(pIndex < 0){
						proposed = false;
					} else if(this._proposeFromStart){
						proposed = (pIndex === 0);
					} 
				}
				if(proposed){
					categoryList.push(this._dataList[i]);
				}
			}
		}
		this._proposeOnCategory(categoryName, categoryList);
		this._show();
	};
	
	InputCompletion.prototype.constructor = InputCompletion;

	//return module exports
	return {
		InputCompletion: InputCompletion
	};
});
