package controllers

import play.api.mvc.{ Action, Controller }
import play.modules.reactivemongo.MongoController
import play.api.libs.json.{ Json, JsError }
import model._

import scala.concurrent.{ Future, ExecutionContext }
import ExecutionContext.Implicits.global
import play.api.Logger

/**
 * User: Björn Reimer
 * Date: 1/18/14
 * Time: 3:46 PM
 */
object BallotController extends Controller with MongoController {

  def createBallotBox = Action(parse.tolerantJson(512 * 1024)) {
    request =>
      {
        request.body.validate[BallotBox](BallotBox.inputReads).map {
          ballotBox =>
            {
              BallotBox.col.insert(ballotBox)
              Logger.debug("Created Ballot: " + ballotBox.toJson)
              Ok(ballotBox.toJson ++ Json.obj("adminSecret" -> ballotBox.adminSecret))
            }
        }.recoverTotal(e => BadRequest(JsError.toFlatJson(e)))
      }
  }

  def getBallotBox(id: String) = Action.async {
    BallotBox.col.find(Json.obj("id" -> id)).one[BallotBox].map {
      case None                          => NotFound
      case Some(b) if b.locked.isDefined => Ok(b.toJsonWithResult)
      case Some(b)                       => Ok(b.toJson)
    }
  }

  def addPaper(id: String) = Action.async(parse.tolerantJson) {
    request =>
      request.body.validate[Paper](Paper.inputReads).map {
        paper =>
          BallotBox.col.find(Json.obj("id" -> id)).one[BallotBox].flatMap {
            case None                                          => Future(NotFound("ballot box"))
            case Some(ballotBox) if ballotBox.locked.isDefined => Future(BadRequest("ballot box is locked"))
            case Some(ballotBox) =>
              // check if vote is valid
              checkRanking(ballotBox.options.getOrElse(Seq()), paper.ranking) match {
                case false => Future(BadRequest("Invalid options"))
                case true =>
                  // Add paper to ballot
                  val query = Json.obj("id" -> id)
                  val set = Json.obj("$push" -> Json.obj("papers" -> paper))
                  BallotBox.col.update(query, set).map {
                    lastError =>
                      if (lastError.updatedExisting) {
                        Ok(paper.toJson)
                      } else {
                        NotFound("ballot not found")
                      }
                  }
              }
          }
      }.recoverTotal(e => Future(BadRequest(JsError.toFlatJson(e))))
  }

  def modifyBallotBox(id: String) = Action.async(parse.tolerantJson) {
    request =>
      request.body.validate[BallotBoxUpdate].map {
        update =>
          BallotBox.col.find(Json.obj("id" -> id)).one[BallotBox].flatMap {
            case None                            => Future(NotFound("ballot not found"))
            case Some(bb) if bb.locked.isDefined => Future(BadRequest("ballot box is locked"))
            case Some(bb) =>
              // check secret
              update.adminSecret.equals(bb.adminSecret) match {
                case false => Future(Unauthorized("wrong admin secret"))
                case true =>
                  if (update.options.isEmpty && update.subject.isEmpty) {
                    Future(BadRequest("nothing to update"))
                  } else {
                    bb.update(update).flatMap {
                      le =>
                        BallotBox.col.find(Json.obj("id" -> id)).one[BallotBox].map {
                          case None          => InternalServerError("could not retrieve update")
                          case Some(updated) => Ok(updated.toJson)
                        }
                    }
                  }
              }
          }
      }.recoverTotal(e => Future(BadRequest(JsError.toFlatJson(e))))
  }

  def lockBallotBox(id: String) = Action.async(parse.tolerantJson) {
    request =>
      (request.body \ "adminSecret").asOpt[String] match {
        case None => Future(Unauthorized("No admin secret"))
        case Some(secret) =>
          BallotBox.col.find(Json.obj("id" -> id)).one[BallotBox].flatMap {
            case None => Future(NotFound("ballot not found"))
            case Some(bb) =>
              // check secret
              secret.equals(bb.adminSecret) match {
                case false => Future(Unauthorized("wrong admin secret"))
                case true =>
                  bb.lock().flatMap {
                    le =>
                      BallotBox.col.find(Json.obj("id" -> id)).one[BallotBox].map {
                        case None          => InternalServerError("could not retrieve update")
                        case Some(updated) => Ok(updated.toJson)
                      }
                  }
              }
          }
      }
  }

  def getResult(id: String) = Action.async {
    request =>
      BallotBox.col.find(Json.obj("id" -> id)).one[BallotBox].map {
        case None     => NotFound("ballot not found")
        case Some(bb) => Ok(bb.toJsonWithResult)
      }
  }

  def modifyPaper(id: String, paperId: String) = Action.async(parse.tolerantJson) {
    request =>
      request.body.validate[PaperUpdate](PaperUpdate.format).map {
        paperUpdate =>
          {
            BallotBox.col.find(Json.obj("id" -> id)).one[BallotBox].flatMap {
              case None                                          => Future(NotFound("ballot box id"))
              case Some(ballotBox) if ballotBox.locked.isDefined => Future(BadRequest("ballot box is locked"))
              case Some(ballotBox) =>
                ballotBox.papers.getOrElse(Seq()).find(_.id.equals(paperId)) match {
                  case None => Future(NotFound("invalid paper id"))
                  case Some(paper) =>
                    paperUpdate.ranking.isEmpty || checkRanking(ballotBox.options.getOrElse(Seq()), paperUpdate.ranking.get) match {
                      case false => Future(BadRequest("bad ranking"))
                      case true =>
                        ballotBox.updatePaper(paperId, paperUpdate).flatMap {
                          case false => Future(BadRequest("bad update"))
                          case true =>
                            BallotBox.col.find(Json.obj("id" -> id)).one[BallotBox].map {
                              case None => InternalServerError("could not retrieve update")
                              case Some(updatedBb) =>
                                val updatedPaper = updatedBb.papers.get.find(_.id.equals(paperId)).get
                                Ok(updatedPaper.toJson)
                            }
                        }
                    }
                }
            }
          }
      }.recoverTotal(e => Future(BadRequest(JsError.toFlatJson(e))))
  }

  def checkRanking(ballotOptions: Seq[BallotOption], ranking: Seq[Seq[String]]): Boolean = {
    val unique = ranking.flatten.distinct.size == ranking.flatten.size
    val valid = ranking.flatten.forall(option => ballotOptions.exists(_.tag.equals(option)))
    valid && unique
  }

  def deletePaper(id: String, paperId: String) = Action.async {
    BallotBox.col.find(Json.obj("id" -> id)).one[BallotBox].flatMap {
      case None => Future(NotFound("ballot box id"))
      case Some(ballotBox) =>
        ballotBox.deletePaper(paperId).map {
          case false => BadRequest("could not delete")
          case true  => Ok("deleted")
        }
    }
  }
}
