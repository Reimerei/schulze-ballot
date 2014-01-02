function HTMLsingleSelect() {
	return	{
				restrict	:	'A',

				controller	:	function($scope) {					
									$scope.$on('select', function(event, origin){																	
										if(event.targetScope != $scope) {
											event.stopPropagation()											
											$scope.selected = origin
											$scope.select($scope.selected)	
										}
									})

									$scope.$on('deselect', function(event, origin){																	
										if(event.targetScope != $scope) {
											event.stopPropagation()
											$scope.selected = undefined
											$scope.select($scope.selected)
										}
									})

									$scope.select = function(target) {										
										$scope.$broadcast('select', target)
									}
								}

			}

}

function HTMLselectAs() {
	return	{
				restrict	:	'A',

				controller	:	function($scope, $element, $attrs) {																		
									$scope.selected = false

									$scope.$on('select', function(event, origin) {										
										$scope.selected =  (origin == $attrs.selectAs)
									})

									$scope.select = function() {
										$scope.$emit('select', $attrs.selectAs)
									}

									$scope.deselect = function() {
										$scope.$emit('deselect', $attrs.selectAs)
									}

								}

			}
}


function HTMLpreferenceRanking($parse, $animate) {
	return	{
				restrict	:	'E',
				scope		:	true,

				link		:	function(scope, element, attrs, controller) {								
									element.css({
										'position'		:	'relative'
									})


									scope.trackMouseMovement = function(event) {
										if(!scope.next_update){													
											var	x		=	event.pageX - element.offset().left,
												y		=	event.pageY - element.offset().top,
												width	=	element.innerWidth(),
												height	=	element.innerHeight(),
												fx		=	scope.rankingOrientation == 'vertical' ? 0.7 : 1,
												fy		=	scope.rankingOrientation == 'horizonal' ? 0.7: 1

											//movement outside the element counts far less than movement inside the element:
											if(x < width*(1-fx))	x = width*(1-fx)	- Math.pow(width*(1-fx)-x, 0.5)
											if(x > width*fx)		x = width*fx 		+ Math.pow(x-width*fx, 0.5)

											if(y < height*(1-fy))	y = height*(1-fy)	- Math.pow(height*(1-fy)-y, 0.5)
											if(y > height*fy)		y = height*fy 		+ Math.pow(y-height*fy, 0.5)	

											//	

											var pos	=	{x:x, y:y}

											scope.$broadcast('dragging-position-update', pos)
											
											//wait 20 milliseconds
											scope.next_update = window.setTimeout(function() {
																	window.clearInterval(scope.next_update)
																	delete scope.next_update																	
																}, 20)
										}										
									}

									scope.startDragging = function(event, last_mousemove, option) {
										
										scope.dragged_element = option.clone().addClass('dragged').appendTo(element)

										controller.replaceOption(option.attr('value'), "")										
										scope.$apply()
										
										scope.trackMouseMovement(last_mousemove)

										$(document).on('mousemove',				scope.trackMouseMovement)							
										$(document).on('mouseup mouseleave',	scope.drop)
									}


									//adjust position of the dragged option (keep it attached to the cursor)
									scope.drag = function(event, pos) {	
										if(pos.x != undefined) scope.dragged_element.css('left',	pos.x - scope.dragged_element.outerWidth(true)/2)
										if(pos.y != undefined) scope.dragged_element.css('top', 	pos.y - scope.dragged_element.outerHeight(true)/2)											
									}

									scope.updateRanks = function(event, rank) {
										controller.moveValue("", rank)
									}

									scope.drop = function(event) {
										$(document).off('mousemove',			scope.trackMousemovement)
										$(document).off('mouseup mouseleave',	scope.drop)

										var	option_id = scope.dragged_element.attr('value')

										controller.replaceOption("", option_id) || controller.addOption(option_id)
										controller.save()

										scope.dragged_element.remove()
										delete scope.dragged_element
									}

									scope.$on('dragging-started', 			scope.startDragging)
									scope.$on('dragging-position-update', 	scope.drag)
									scope.$on('dragging-into-rank', 		scope.updateRanks)									

									element.toggleClass('horizontal',	scope.rankingOrientation == 'horizontal')
									element.toggleClass('vertical', 	scope.rankingOrientation != 'horizontal')
									
								},

				controller	:	function($scope, $element, $attrs){

									//there are to sets of rankingData:
									// -the model shared with other directives
									// -an internal set passed to ng-repeat including empty ranks
									// both sets share some of the ranks
									// it get's a bit tricky to keep them in sync when it comes to adding or removing ranks in one of the two data sets

									
									var	self			= this

									$scope.rankingData		= []
									$scope.raw_rankingData	= $scope.$eval($attrs.rankingModel)


									this.addRank			=	function(rank, after) {																		
																	var pos 	= typeof after =='number' ? after : $scope.rankingData.indexOf(after),
																		length	= $scope.rankingData.length																	
																	
																	if(pos < 0) 				$scope.rankingData.unshift(rank)
																	if(pos >= 0 && pos <length)	$scope.rankingData.splice(pos+1,0, rank)
																	if(pos >= length)			$scope.rankingData.push(rank)
																	
																}

									this.removeRank			=	function(rank) {
																	var pos = typeof rank =='number'  ? rank : $scope.rankingData.indexOf(rank)
																	if(pos != -1) $scope.rankingData.splice(pos,1)
																}

									this.isEmpty			=	function(rank) {
																	return(rank && rank.length == 0)
																}

									this.isDepleted			=	function(rank) {
																	return(rank && rank.length ==1 && rank[0] == "")
																}

									this.hasPlaceholder		=	function(rank) {
																	return(rank && rank.indexOf("") != -1)
																}							

									this.processRankingData	=	function() {
																	var options 		= {}
																	$scope.rankingData	= []

																	this.addRank([])			

																	$scope.raw_rankingData.forEach(function(rank, index) {
																		var copy = []
																		self.addRank(copy, $scope.rankingData.length-1)

																		rank.forEach(function(option, index){
																			if(!options[option]) copy.push(option) 
																			options[option] = true	//prevent dublicates
																		})
																		self.addRank([], copy)																		
																	})
																}

									this.exportRankingData	=	function() {
																	$scope.raw_rankingData.splice(0, $scope.raw_rankingData.length)
																	$scope.rankingData.forEach(function(rank, index) {
																		if(!self.isEmpty(rank)) $scope.raw_rankingData.push(rank)
																	})
																}

									this.promoteRank		=	function(rank) {
																	var pos 	= typeof rank == "number" ? rank : $scope.rankingData.indexOf(rank)

																	this.addRank([], pos)
																	this.addRank([], pos-1)
																}

									this.demoteRank			=	function(rank) {
																	var pos 	= typeof rank == "number" ? rank : $scope.rankingData.indexOf(rank),
																		prev	= $scope.rankingData[pos-1],
																		next	= $scope.rankingData[pos+1]

																	if(this.isEmpty(next)) this.removeRank(pos+1)
																	if(this.isEmpty(prev)) this.removeRank(pos-1)
																}

									this.removeOption		=	function(option) {																															
																	var last_rank = undefined
																	$scope.rankingData.forEach(function(rank, index){
																		var pos = rank.indexOf(option)
																		if(pos != -1) {
																			last_rank = rank																																							
																			rank.splice(pos, 1)
																			if(self.isEmpty(rank)) self.demoteRank(rank) //there must not be any dublicates of option for this to work properly
																		}
																	})

																	return(last_rank)																			
																}

									this.addOption			=	function(option, rank) {
																	rank = rank || $scope.rankingData.length-1
																	if(this.isEmpty(rank) && option !="") this.promoteRank(rank)
																	rank.push(option)
																	
																	return(this.commit())
																}

									this.replaceOption		=	function(option1, option2) {																	
																	return(this.addOption(option2, this.removeOption(option1)) && this.commit())
																}

									this.moveOption			=	function(option, rank) {
																	return(this.removeOption(option) && this.addOption(option, rank) && this.commit())
																}

									this.commit				=	function() {
																	$scope.$apply()
																	$scope.$broadcast('ranking-update')
																	return(true)
																}

									this.save				=	function() {
																	$scope.saved = true
																	this.exportRankingData()
																	$scope.$apply()															
																}											

									this.processRankingData()

									$scope.$watchCollection($attrs.rankingModel, function(new_value){																														
										_l(new_value)										
										if(!$scope.saved){
											$scope.raw_rankingData	= new_value											
											self.processRankingData()											
										}
										delete $scope.saved
									}, true)


									$scope.noDragging			= $attrs.noDragging != undefined	

									$scope.rankingOrientation 	= $attrs.rankingOrientation || 'vertical'																		
									
								}
			}
}

function HTMLpreferenceRank($scope, $animate) {
	return	{
				restrict	:	'E',
				require		:	'^preferenceRanking',

				link		:	function(scope, element, attrs, rankingCtrl) {	
									
									scope.evaluatePositionUpdate = function(event, pos) {
										if(!scope.hasPlaceholder() && _over(element, pos, true)) {
											rankingCtrl.moveOption("", scope.rank)
											scope.$apply()
										}
									}

									scope.isEmpty = function() {
										return(rankingCtrl.isEmpty(scope.rank))
									}

									scope.isDepleted = function() {
										return(rankingCtrl.isDepleted(scope.rank))
									}

									scope.hasPlaceholder = function() {
										return(rankingCtrl.hasPlaceholder(scope.rank))
									}

									scope.refresh = function() {										
										element.toggleClass('empty', 	scope.isEmpty())
										element.toggleClass('nonempty',	!scope.isEmpty())
										element.toggleClass('depleted',	scope.isDepleted())
									}

									scope.$on('dragging-position-update', 	scope.evaluatePositionUpdate)
									scope.$on('ranking-update', 			scope.refresh)
									scope.refresh()
								}
			}
}


function HTMLpreferenceOption($scope, $animate) {
	return	{
				restrict	:	'E',
				require		:	'^preferenceRanking',

				link		:	function(scope, element, attrs, rankingCtrl){

									//Dragging controls:

									//400 ms of mouse down trigger the drag
									scope.waitForDrag = function(event) {
										scope.wait_for_it	=	window.setTimeout(scope.startDragging, 300)
										scope.trackMouseMovement(event)
										$(document).on('mousemove)', scope.trackMouseMovement)
									}							

									scope.trackMouseMovement = function(event){
										scope.last_mousemove = event
									}	

									//clear waiting timeout, attribute and event listener
									scope.stopWaitingForDrag = function() {
										$(document).off('mouseup click', scope.stopWaitingForDrag)
										$(document).off('mousemove', scope.trackMousemovement)

										window.clearTimeout(scope.wait_for_it)
										delete scope.wait_for_it										
									}

									//intitiate the dragging:
									scope.startDragging = function() {										
										//cancel wait:
										scope.stopWaitingForDrag()

										//clear selection that might have occured while holding the mouse down
										window.getSelection().removeAllRanges()
										
										scope.$emit('dragging-started', scope.last_mousemove, element)

										delete scope.last_mousemove																		
									}

									//listen for a mousedown to get the dragging started
									if(attrs.value && !scope.noDragging) {
										element.on('mousedown', function(event) {
											scope.waitForDrag(event)	
											event.preventDefault()
											event.stopImmediatePropagation() //ist das nötig?

											$(document).one('mouseup click', scope.stopWaitingForDrag)
										})
									}									
									
								}
			}
}